import { randomUUID } from 'node:crypto'
import {
  canTransitionJob,
  type JobStatus,
  type JobRecord,
  type JobHandler
} from '../../shared/types/job'

export interface JobStore<TPayload = unknown, TResult = unknown> {
  create(record: JobRecord<TPayload, TResult>): void
  update(id: string, patch: Partial<JobRecord<TPayload, TResult>>): void
  get(id: string): JobRecord<TPayload, TResult> | undefined
}

export class InvalidJobTransitionError extends Error {
  constructor(from: JobStatus, to: JobStatus) {
    super(`Transicao de job invalida: ${from} -> ${to}`)
    this.name = 'InvalidJobTransitionError'
  }
}

/**
 * Runner generico em memoria (03_TECHNICAL_ARCHITECTURE.md secao 8: proxy, waveform, thumbnail,
 * export, transcricao, indexacao). Decisao registrada: nenhuma tabela `jobs` polimorfica e
 * persistida nesta fase - a persistencia concreta fica a cargo de um `JobStore` especifico (ver
 * `export-job-store.ts`, a unica implementacao existente). Este runner e agnostico de persistencia.
 */
export class JobRunner<TPayload = unknown, TResult = unknown> {
  constructor(private readonly store: JobStore<TPayload, TResult>) {}

  enqueue(type: string, payload: TPayload): JobRecord<TPayload, TResult> {
    const now = new Date().toISOString()
    const record: JobRecord<TPayload, TResult> = {
      id: randomUUID(),
      type,
      status: 'QUEUED',
      progress: 0,
      payload,
      createdAt: now,
      updatedAt: now
    }
    this.store.create(record)
    return record
  }

  async run(id: string, handler: JobHandler<TPayload, TResult>): Promise<void> {
    const record = this.store.get(id)
    if (!record) return
    this.transition(record, 'RUNNING')

    try {
      const result = await handler(record.payload, (progress) => {
        this.store.update(id, { progress, updatedAt: new Date().toISOString() })
      })
      // EXP-008 (vigesimo oitavo incremento - Fase 4, cancelamento real) - entre o `await handler`
      // acima e este ponto, um `cancel(id)` CONCORRENTE pode ja ter movido o job pra CANCELED (via
      // uma chamada separada, nao esta mesma `record` em memoria - `this.store.get(id)` sempre
      // devolve um objeto NOVO a cada chamada, entao a mutacao de `cancel()` nunca e visivel na
      // variavel local `record` deste metodo). Sem essa checagem, `transition(record, 'COMPLETED')`
      // tentaria uma transicao invalida (`CANCELED -> COMPLETED`, `JOB_TRANSITIONS.CANCELED: []`)
      // e lancaria `InvalidJobTransitionError` - o job JA estava correto (CANCELED), so o handler
      // terminando depois tentava sobrescreve-lo. Re-busca o estado REAL antes de decidir.
      if (this.store.get(id)?.status === 'CANCELED') return
      this.transition(record, 'COMPLETED', {
        progress: 100,
        result,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
    } catch (error) {
      if (this.store.get(id)?.status === 'CANCELED') return
      this.transition(record, 'FAILED', {
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
    }
  }

  cancel(id: string): void {
    const record = this.store.get(id)
    if (!record) return
    this.transition(record, 'CANCELED', {
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    })
  }

  /**
   * EXP-003/004 (vigesimo quinto incremento - Fase 4) - bug real corrigido: antes, uma transicao
   * pra COMPLETED/FAILED/CANCELED virava DUAS chamadas separadas a `store.update` (uma so com
   * `status` daqui, outra logo depois em `run()`/`cancel()` so com `result`/`error`/`completedAt`).
   * `ExportJobStore.update` (unica implementacao concreta de `JobStore`) so grava `outputPath`
   * quando ve `status: 'COMPLETED'` na MESMA chamada que carrega `result` - a segunda chamada
   * (so com `result`, sem `status`) caia no ramo generico de `updateProgress`, que NUNCA grava
   * `outputPath`. Resultado: todo job de exportacao terminava com `outputPath: ''` no banco, mesmo
   * com o arquivo real escrito com sucesso no disco - so descoberto agora que `ExportService`
   * (EXP-003/004) finalmente exercita `run()` de ponta a ponta pela primeira vez desde que este
   * runner foi desenhado. `extraPatch` funde tudo numa UNICA chamada a `store.update`, entao
   * qualquer `JobStore` que precise ver `status` e o resto do patch juntos (como este) ve os dois
   * de uma vez.
   */
  private transition(
    record: JobRecord<TPayload, TResult>,
    to: JobStatus,
    extraPatch: Partial<JobRecord<TPayload, TResult>> = {}
  ): void {
    if (!canTransitionJob(record.status, to)) {
      throw new InvalidJobTransitionError(record.status, to)
    }
    record.status = to
    this.store.update(record.id, { status: to, ...extraPatch })
  }
}
