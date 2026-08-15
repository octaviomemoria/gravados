import { describe, it, expect } from 'vitest'
import { JobRunner, type JobStore } from '../../../src/main/jobs/job-runner'
import type { JobRecord } from '../../../src/shared/types/job'

function createInMemoryStore<TPayload, TResult>(): JobStore<TPayload, TResult> & {
  get: (id: string) => JobRecord<TPayload, TResult> | undefined
} {
  const records = new Map<string, JobRecord<TPayload, TResult>>()
  return {
    create: (record) => {
      records.set(record.id, record)
    },
    update: (id, patch) => {
      const current = records.get(id)
      if (!current) return
      records.set(id, { ...current, ...patch })
    },
    get: (id) => records.get(id)
  }
}

describe('JobRunner', () => {
  it('runs a job through QUEUED -> RUNNING -> COMPLETED', async () => {
    const store = createInMemoryStore<{ value: number }, { doubled: number }>()
    const runner = new JobRunner(store)
    const record = runner.enqueue('double', { value: 21 })
    expect(store.get(record.id)?.status).toBe('QUEUED')

    await runner.run(record.id, async (payload) => ({ doubled: payload.value * 2 }))

    const finalRecord = store.get(record.id)
    expect(finalRecord?.status).toBe('COMPLETED')
    expect(finalRecord?.progress).toBe(100)
    expect(finalRecord?.result).toEqual({ doubled: 42 })
  })

  it('marks a job FAILED when the handler throws', async () => {
    const store = createInMemoryStore<undefined, undefined>()
    const runner = new JobRunner(store)
    const record = runner.enqueue('boom', undefined)

    await runner.run(record.id, async () => {
      throw new Error('falha proposital')
    })

    const finalRecord = store.get(record.id)
    expect(finalRecord?.status).toBe('FAILED')
    expect(finalRecord?.error).toBe('falha proposital')
  })

  it('reports progress updates during execution', async () => {
    const store = createInMemoryStore<undefined, undefined>()
    const runner = new JobRunner(store)
    const record = runner.enqueue('progress', undefined)
    const observedProgress: number[] = []

    await runner.run(record.id, async (_payload, report) => {
      report(50)
      observedProgress.push(store.get(record.id)?.progress ?? -1)
      return undefined
    })

    expect(observedProgress).toEqual([50])
  })

  it('cancels a queued job', () => {
    const store = createInMemoryStore<undefined, undefined>()
    const runner = new JobRunner(store)
    const record = runner.enqueue('cancelable', undefined)

    runner.cancel(record.id)

    expect(store.get(record.id)?.status).toBe('CANCELED')
  })

  // EXP-008 - regressao do bug de corrida encontrado por raciocinio de design (ver comentario em
  // `job-runner.ts`): um `cancel()` CONCORRENTE, disparado enquanto o handler de `run()` ainda
  // esta em voo, ja move o job pra CANCELED no store ANTES do handler terminar. Sem a re-checagem
  // de status logo antes da transicao final, `run()` tentaria CANCELED -> FAILED (handler que
  // rejeita, simulando `result.canceled` de `ExportService`) e lancaria `InvalidJobTransitionError`
  // - o job ja estava correto, so o handler terminando depois tentava sobrescreve-lo.
  it('keeps a job CANCELED when cancel() races with the handler rejecting', async () => {
    const store = createInMemoryStore<undefined, undefined>()
    const runner = new JobRunner(store)
    const record = runner.enqueue('racy', undefined)

    const runPromise = runner.run(record.id, async () => {
      // Simula um `cancel()` concorrente chegando enquanto o handler ainda esta "rodando" (ex.:
      // aguardando o processo FFmpeg real terminar) - move o job pra CANCELED por FORA da
      // variavel `record` local de `run()`.
      runner.cancel(record.id)
      throw new Error('Exportacao cancelada pelo usuario')
    })

    await expect(runPromise).resolves.toBeUndefined()
    expect(store.get(record.id)?.status).toBe('CANCELED')
    // Nao deve ter sobrescrito com a mensagem de erro do handler - CANCELED venceu.
    expect(store.get(record.id)?.error).toBeUndefined()
  })

  // Mesmo raciocinio, mas para o caminho de SUCESSO (`result.canceled` chega DEPOIS que o
  // handler ja tinha retornado um resultado - improvavel na pratica pro `ExportService` real, mas
  // cobre o outro `if` de re-checagem em `run()`, simetrico ao do catch).
  it('keeps a job CANCELED when cancel() races with the handler succeeding', async () => {
    const store = createInMemoryStore<{ value: number }, { doubled: number }>()
    const runner = new JobRunner(store)
    const record = runner.enqueue('racy-success', { value: 10 })

    const runPromise = runner.run(record.id, async (payload) => {
      runner.cancel(record.id)
      return { doubled: payload.value * 2 }
    })

    await expect(runPromise).resolves.toBeUndefined()
    const finalRecord = store.get(record.id)
    expect(finalRecord?.status).toBe('CANCELED')
    expect(finalRecord?.result).toBeUndefined()
  })
})
