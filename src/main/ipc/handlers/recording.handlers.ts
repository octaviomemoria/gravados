import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  StartRecordingRequestSchema,
  StartRecordingResponseSchema,
  AppendRecordingChunkRequestSchema,
  AppendRecordingChunkResponseSchema,
  StopRecordingRequestSchema,
  StopRecordingResponseSchema,
  PauseRecordingRequestSchema,
  PauseRecordingResponseSchema,
  ResumeRecordingRequestSchema,
  ResumeRecordingResponseSchema,
  AddMarkerRequestSchema,
  AddMarkerResponseSchema,
  GetRecordingStateRequestSchema,
  GetRecordingStateResponseSchema
} from '../../../shared/schemas/recording.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * Terceiro incremento real da Fase 1 - Recording Core (RF-002..RF-016, microfone + camera -
 * ver README "Decisoes de arquitetura"). `start`/`appendChunk`/`stop` sao reais, delegando a
 * `RecordingSessionManager`. Segmentacao por tempo/tamanho (RF-012/RF-013) chegou no sexto
 * incremento - `appendChunk` agora repassa `segmentIndex`. Pausar/retomar (RF-010) chegou no
 * setimo incremento. Marcadores (RF-016) chegaram no oitavo incremento - `addMarker` fica aqui
 * (depende da sessao ativa); o canal de LEITURA (`markers.list`) fica em `markers.handlers.ts`.
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
    IPC_CHANNELS.recording.pause,
    { request: PauseRecordingRequestSchema, response: PauseRecordingResponseSchema },
    async (request) => context.recordingSessionManager.pause(request.projectId)
  )

  registerHandler(
    IPC_CHANNELS.recording.resume,
    { request: ResumeRecordingRequestSchema, response: ResumeRecordingResponseSchema },
    async (request) => context.recordingSessionManager.resume(request.projectId)
  )

  registerHandler(
    IPC_CHANNELS.recording.addMarker,
    { request: AddMarkerRequestSchema, response: AddMarkerResponseSchema },
    async (request) => ({
      marker: await context.recordingSessionManager.addMarker(
        request.projectId,
        request.title,
        request.note
      )
    })
  )

  registerHandler(
    IPC_CHANNELS.recording.getState,
    { request: GetRecordingStateRequestSchema, response: GetRecordingStateResponseSchema },
    async () => ({ state: context.recordingSessionManager.getState() })
  )
}
