/**
 * Formas publicas das entidades persistidas (06_DATA_MODEL.md), trafegadas via IPC.
 * Deliberadamente independentes dos tipos internos do Drizzle (`main/database/schema`) para nao
 * acoplar `shared/` (consumido pelo renderer) a detalhes de implementacao do main process.
 */

import type { ProjectStatus } from './recording-state'
import type { JobStatus } from './job'

/**
 * Nota de terminologia: este union (maiusculo, underscore) e o canonico para banco/IPC/UI.
 * O `manifest.json` de recuperacao (04_RECORDING_ENGINE.md) usa, de forma deliberadamente isolada,
 * um formato minusculo (`screen`, `camera`, `microphone`, `system_audio`) por ser um artefato de
 * recuperacao independente do schema SQLite - ver `main/media/project-filesystem.ts`.
 */
export const TRACK_TYPES = ['SCREEN', 'CAMERA', 'MICROPHONE', 'SYSTEM_AUDIO'] as const
export type TrackType = (typeof TRACK_TYPES)[number]

export interface ProjectEntity {
  id: string
  title: string
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  durationMs: number | null
  status: ProjectStatus
  rootPath: string
  notes: string | null
}

export interface TrackEntity {
  id: string
  projectId: string
  type: TrackType
  enabled: boolean
  position: number
  startOffsetMs: number
}

export interface SegmentEntity {
  id: string
  trackId: string
  seqIndex: number
  relativePath: string
  startedAtMs: number
  endedAtMs: number | null
  durationMs: number | null
  byteSize: number
  mimeType: string
  finalized: boolean
}

export interface MarkerEntity {
  id: string
  projectId: string
  timestampMs: number
  title: string | null
  note: string | null
}

export interface EditProjectEntity {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  revision: number
  /** EDIT-007 - quantas operacoes do log ordenado (`edit_operations.sequence`) estao ativas na
   * timeline editada atual; ver comentario em `edit-projects.schema.ts`. */
  activeOperationSequence: number
}

export interface EditOperationEntity {
  id: string
  editProjectId: string
  sequence: number
  type: string
  startMs: number | null
  endMs: number | null
  trackId: string | null
  payloadJson: string
}

export interface ExportJobEntity {
  id: string
  editProjectId: string
  status: JobStatus
  progress: number
  outputPath: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

export interface SettingsEntity {
  key: string
  valueJson: string
  updatedAt: string
}

/** AI-001 (Fase 5 — Transcrição). Rastreia so o PROCESSO assincrono - o resultado em si vive em
 * `TranscriptEntity`/`TranscriptSegmentEntity`, criados unicamente quando este job termina
 * `COMPLETED` (ver comentario em `main/database/schema/transcription.schema.ts`). */
export interface TranscriptionJobEntity {
  id: string
  projectId: string
  status: JobStatus
  progress: number
  provider: string
  language: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

export interface TranscriptEntity {
  id: string
  projectId: string
  provider: string
  model: string
  language: string | null
  createdAt: string
  /** Refinamento pos-MVP - texto editado manualmente pelo usuario (ver comentario completo em
   * `main/database/schema/transcription.schema.ts`). `null` ate a primeira edicao. */
  editedText: string | null
}

export interface TranscriptSegmentEntity {
  id: string
  transcriptId: string
  startMs: number
  endMs: number
  speaker: string | null
  text: string
  confidence: number | null
}
