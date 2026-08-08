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
 * Primeiro incremento real da Fase 1 - Recording Core (RF-002..RF-016, somente microfone -
 * ver README "Decisoes de arquitetura"). `start`/`appendChunk`/`stop` sao reais, delegando a
 * `RecordingSessionManager`. Tela/camera/audio do sistema, segmentacao, pause/resume e
 * marcadores ficam para incrementos seguintes.
 */
export function registerRecordingHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.recording.start,
    { request: StartRecordingRequestSchema, response: StartRecordingResponseSchema },
    async (request) => context.recordingSessionManager.start(request.projectId)
  )

  registerHandler(
    IPC_CHANNELS.recording.appendChunk,
    { request: AppendRecordingChunkRequestSchema, response: AppendRecordingChunkResponseSchema },
    async (request) =>
      context.recordingSessionManager.appendChunk(
        request.trackId,
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
