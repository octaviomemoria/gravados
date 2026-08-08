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
      this.transition(record, 'COMPLETED')
      this.store.update(id, {
        progress: 100,
        result,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
    } catch (error) {
      this.transition(record, 'FAILED')
      this.store.update(id, {
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
    }
  }

  cancel(id: string): void {
    const record = this.store.get(id)
    if (!record) return
    this.transition(record, 'CANCELED')
    this.store.update(id, {
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    })
  }

  private transition(record: JobRecord<TPayload, TResult>, to: JobStatus): void {
    if (!canTransitionJob(record.status, to)) {
      throw new InvalidJobTransitionError(record.status, to)
    }
    record.status = to
    this.store.update(record.id, { status: to })
  }
}
