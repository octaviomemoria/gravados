import type { JobStore } from './job-runner'
import type { ExportJobRepository } from '../database/repositories'
import type { JobRecord } from '../../shared/types/job'

export interface ExportJobPayload {
  editProjectId: string
}

export interface ExportJobResult {
  outputPath: string
}

/**
 * Unica implementacao concreta de `JobStore` nesta fase, adaptando a tabela `export_jobs`
 * (decisao registrada sobre o sistema de jobs generico - ver README).
 */
export class ExportJobStore implements JobStore<ExportJobPayload, ExportJobResult> {
  constructor(private readonly repository: ExportJobRepository) {}

  create(record: JobRecord<ExportJobPayload, ExportJobResult>): void {
    this.repository.create({
      id: record.id,
      editProjectId: record.payload.editProjectId,
      status: record.status,
      progress: record.progress,
      outputPath: null,
      error: null,
      createdAt: record.createdAt,
      completedAt: null
    })
  }

  update(id: string, patch: Partial<JobRecord<ExportJobPayload, ExportJobResult>>): void {
    const current = this.repository.findById(id)
    if (!current) return

    if (patch.status === 'COMPLETED') {
      this.repository.complete(
        id,
        patch.result?.outputPath ?? '',
        patch.completedAt ?? new Date().toISOString()
      )
      return
    }
    if (patch.status === 'FAILED') {
      this.repository.fail(
        id,
        patch.error ?? 'Erro desconhecido',
        patch.completedAt ?? new Date().toISOString()
      )
      return
    }
    if (patch.status === 'CANCELED') {
      this.repository.cancel(id, patch.completedAt ?? new Date().toISOString())
      return
    }
    this.repository.updateProgress(id, patch.progress ?? current.progress, patch.status ?? current.status)
  }

  get(id: string): JobRecord<ExportJobPayload, ExportJobResult> | undefined {
    const row = this.repository.findById(id)
    if (!row) return undefined
    return {
      id: row.id,
      type: 'export',
      status: row.status,
      progress: row.progress,
      payload: { editProjectId: row.editProjectId },
      result: row.outputPath ? { outputPath: row.outputPath } : undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
      completedAt: row.completedAt ?? undefined
    }
  }
}
