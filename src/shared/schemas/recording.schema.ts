import { z } from 'zod'
import { RECORDING_STATES } from '../types/recording-state'
import { EmptyRequestSchema, IdSchema } from './common.schema'

export const RecordingStateSchema = z.enum(RECORDING_STATES)

/**
 * RF-009/RF-014/RF-011 (primeiro incremento - somente microfone, ver README "Decisoes de
 * arquitetura"). O projeto (RF-001) ja deve existir via `project.create` antes de chamar `start` -
 * `recording.*` nao cria o projeto, so a sessao de captura sobre um projeto existente.
 */
export const StartRecordingRequestSchema = z.object({
  projectId: IdSchema
})
export type StartRecordingRequest = z.infer<typeof StartRecordingRequestSchema>
export const StartRecordingResponseSchema = z.object({
  state: RecordingStateSchema,
  microphoneTrackId: IdSchema
})

/**
 * Canal dedicado para chunks binarios do MediaRecorder (RF-014: "nao acumular a sessao completa
 * em memoria" - cada chunk e escrito em disco assim que chega, nunca bufferizado no processo
 * main). `data` trafega como `Uint8Array` - a serializacao estruturada do Electron transporta
 * bytes nativamente, sem round-trip via base64/JSON.
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
