import { z } from 'zod'
import { RECORDING_STATES } from '../types/recording-state'
import { EmptyRequestSchema } from './common.schema'

export const RecordingStateSchema = z.enum(RECORDING_STATES)

/**
 * Registrados e validados nesta fase, mas a implementacao real (dispositivos, chunks, FFmpeg)
 * e Fase 1 - Recording Core. O handler retorna `NotImplementedError` (ver `main/ipc/handlers`).
 */
export const StartRecordingRequestSchema = z.object({
  projectTitle: z.string().min(1).max(200)
})
export type StartRecordingRequest = z.infer<typeof StartRecordingRequestSchema>
export const StartRecordingResponseSchema = z.object({ state: RecordingStateSchema })

export const StopRecordingRequestSchema = z.object({ projectId: z.string().uuid() })
export type StopRecordingRequest = z.infer<typeof StopRecordingRequestSchema>
export const StopRecordingResponseSchema = z.object({ state: RecordingStateSchema })

export const GetRecordingStateRequestSchema = EmptyRequestSchema
export const GetRecordingStateResponseSchema = z.object({ state: RecordingStateSchema })
