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
})
