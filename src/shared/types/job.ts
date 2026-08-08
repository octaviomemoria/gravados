/**
 * Sistema de jobs generico (03_TECHNICAL_ARCHITECTURE.md secao 8).
 * Aplicavel a operacoes demoradas futuras: proxy, waveform, thumbnail, export, transcricao, indexacao.
 *
 * Decisao registrada: nesta fase nenhuma tabela `jobs` polimorfica e persistida - apenas estes tipos
 * genericos e o runner em memoria (`main/jobs/job-runner.ts`). A unica persistencia concreta e a
 * tabela `export_jobs`, unico tipo de job que a documentacao (06_DATA_MODEL.md) de fato especifica
 * nesta fase. Ver README, secao "Decisoes de arquitetura".
 */

export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED'] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  QUEUED: ['RUNNING', 'CANCELED'],
  RUNNING: ['COMPLETED', 'FAILED', 'CANCELED'],
  COMPLETED: [],
  FAILED: [],
  CANCELED: []
}

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to)
}

export interface JobRecord<TPayload = unknown, TResult = unknown> {
  readonly id: string
  readonly type: string
  status: JobStatus
  progress: number
  readonly payload: TPayload
  result?: TResult
  error?: string
  readonly createdAt: string
  updatedAt: string
  completedAt?: string
}

export type JobProgressReporter = (progress: number) => void

export type JobHandler<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  report: JobProgressReporter
) => Promise<TResult>
