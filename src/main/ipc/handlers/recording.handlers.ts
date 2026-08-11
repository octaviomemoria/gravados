import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  StartRecordingRequestSchema,
  StartRecordingResponseSchema,
  AppendRecordingChunkRequestSchema,
  AppendRecordingChunkResponseSchema,
  StopRecordingRequestSchema,
  StopRecordingResponseSchema,
  GetRecordingStateRequestSchema,
  GetRecordingStateResponseSchema
} from '../../../shared/schemas/recording.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * Terceiro incremento real da Fase 1 - Recording Core (RF-002..RF-016, microfone + camera -
 * ver README "Decisoes de arquitetura"). `start`/`appendChunk`/`stop` sao reais, delegando a
 * `RecordingSessionManager`. Segmentacao por tempo/tamanho (RF-012/RF-013) chegou no sexto
 * incremento - `appendChunk` agora repassa `segmentIndex`. Pause/resume e marcadores ficam para
 * incrementos seguintes.
 */
export function registerRecordingHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.recording.start,
    { request: StartRecordingRequestSchema, response: StartRecordingResponseSchema },
    async (request) =>
      context.recordingSessionManager.start(request.projectId, request.trackTypes)
  )

  registerHandler(
    IPC_CHANNELS.recording.appendChunk,
    { request: AppendRecordingChunkRequestSchema, response: AppendRecordingChunkResponseSchema },
    async (request) =>
      context.recordingSessionManager.appendChunk(
        request.trackId,
        request.segmentIndex,
        request.sequence,
        request.mimeType,
        request.data
      )
  )

  registerHandler(
    IPC_CHANNELS.recording.stop,
    { request: StopRecordingRequestSchema, response: StopRecordingResponseSchema },
    async (request) => context.recordingSessionManager.stop(request.projectId)
  )

  registerHandler(
    IPC_CHANNELS.recording.getState,
    { request: GetRecordingStateRequestSchema, response: GetRecordingStateResponseSchema },
    async () => ({ state: context.recordingSessionManager.getState() })
  )
}
