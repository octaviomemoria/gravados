import type { JobStore } from './job-runner'
import type { TranscriptionJobRepository } from '../database/repositories'
import type { JobRecord } from '../../shared/types/job'

export interface TranscriptionJobPayload {
  projectId: string
  provider: string
  language: string | null
}

/** `transcriptId` nao e persistido NESTA tabela - o transcript de verdade (cabecalho + segmentos)
 * ja foi gravado por `TranscriptRepository.createWithSegments` ANTES do handler retornar (ver
 * `TranscriptionService`); o `result` aqui existe so pra satisfazer a assinatura generica de
 * `JobHandler`, a UI real busca o transcript via `transcription.getTranscript`, nao via este job. */
export interface TranscriptionJobResult {
  transcriptId: string
}

/** AI-001 - segunda implementacao concreta de `JobStore` (a primeira e `ExportJobStore`),
 * confirmando que o runner generico (`job-runner.ts`, decisao registrada desde a Fase 0) de fato
 * serve pra mais de um tipo de job sem nenhuma mudanca nele mesmo. */
export class TranscriptionJobStore implements JobStore<TranscriptionJobPayload, TranscriptionJobResult> {
  constructor(private readonly repository: TranscriptionJobRepository) {}

  create(record: JobRecord<TranscriptionJobPayload, TranscriptionJobResult>): void {
    this.repository.create({
      id: record.id,
      projectId: record.payload.projectId,
      status: record.status,
      progress: record.progress,
      provider: record.payload.provider,
      language: record.payload.language,
      error: null,
      createdAt: record.createdAt,
      completedAt: null
    })
  }

  update(id: string, patch: Partial<JobRecord<TranscriptionJobPayload, TranscriptionJobResult>>): void {
    const current = this.repository.findById(id)
    if (!current) return

    if (patch.status === 'COMPLETED') {
      this.repository.complete(id, patch.completedAt ?? new Date().toISOString())
      return
    }
    if (patch.status === 'FAILED') {
      this.repository.fail(id, patch.error ?? 'Erro desconhecido', patch.completedAt ?? new Date().toISOString())
      return
    }
    if (patch.status === 'CANCELED') {
      this.repository.cancel(id, patch.completedAt ?? new Date().toISOString())
      return
    }
    this.repository.updateProgress(id, patch.progress ?? current.progress, patch.status ?? current.status)
  }

  get(id: string): JobRecord<TranscriptionJobPayload, TranscriptionJobResult> | undefined {
    const row = this.repository.findById(id)
    if (!row) return undefined
    return {
      id: row.id,
      type: 'transcription',
      status: row.status,
      progress: row.progress,
      payload: { projectId: row.projectId, provider: row.provider, language: row.language },
      error: row.error ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
      completedAt: row.completedAt ?? undefined
    }
  }
}
