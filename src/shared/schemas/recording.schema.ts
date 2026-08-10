import { z } from 'zod'
import { RECORDING_STATES } from '../types/recording-state'
import { EmptyRequestSchema, IdSchema } from './common.schema'

export const RecordingStateSchema = z.enum(RECORDING_STATES)

/**
 * RF-002/RF-005/RF-006/RF-007 (combinacoes + trilhas independentes) - quinto incremento:
 * microfone, camera, tela e audio do sistema simultaneos (ver README "Decisoes de arquitetura").
 * Tela e audio do sistema usam `chromeMediaSourceId`/`chromeMediaSource: 'desktop'` (API nao-
 * padrao do Chromium); audio do sistema e "quando suportado pela plataforma" (RF-005) - falha ao
 * adquirir a stream nunca impede as demais trilhas de gravar (ver `useRecordingSession.ts`). O
 * projeto (RF-001) ja deve existir via `project.create` antes de chamar `start` - `recording.*`
 * nao cria o projeto, so a sessao de captura sobre um projeto existente.
 */
export const RecordingTrackTypeSchema = z.enum(['MICROPHONE', 'CAMERA', 'SCREEN', 'SYSTEM_AUDIO'])
export type RecordingTrackType = z.infer<typeof RecordingTrackTypeSchema>

export const StartRecordingRequestSchema = z.object({
  projectId: IdSchema,
  trackTypes: z.array(RecordingTrackTypeSchema).min(1)
})
export type StartRecordingRequest = z.infer<typeof StartRecordingRequestSchema>

export const RecordingTrackHandleSchema = z.object({
  trackId: IdSchema,
  type: RecordingTrackTypeSchema
})
export type RecordingTrackHandle = z.infer<typeof RecordingTrackHandleSchema>

export const StartRecordingResponseSchema = z.object({
  state: RecordingStateSchema,
  tracks: z.array(RecordingTrackHandleSchema)
})

/**
 * Canal dedicado para chunks binarios do MediaRecorder (RF-014: "nao acumular a sessao completa
 * em memoria" - cada chunk e escrito em disco assim que chega, nunca bufferizado no processo
 * main). `data` trafega como `Uint8Array` - a serializacao estruturada do Electron transporta
 * bytes nativamente, sem round-trip via base64/JSON. `trackId` roteia o chunk para a trilha
 * correta dentro da sessao ativa (uma trilha por fonte: microfone, camera, ...).
 */
export const AppendRecordingChunkRequestSchema = z.object({
  trackId: IdSchema,
  sequence: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  data: z.instanceof(Uint8Array)
})
export type AppendRecordingChunkRequest = z.infer<typeof AppendRecordingChunkRequestSchema>
export const AppendRecordingChunkResponseSchema = z.object({
  receivedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative()
})

export const StopRecordingRequestSchema = z.object({ projectId: IdSchema })
export type StopRecordingRequest = z.infer<typeof StopRecordingRequestSchema>
export const StopRecordingResponseSchema = z.object({ state: RecordingStateSchema })

export const GetRecordingStateRequestSchema = EmptyRequestSchema
export const GetRecordingStateResponseSchema = z.object({ state: RecordingStateSchema })
