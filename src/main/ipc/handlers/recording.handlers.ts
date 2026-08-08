import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  StartRecordingRequestSchema,
  StartRecordingResponseSchema,
  StopRecordingRequestSchema,
  StopRecordingResponseSchema,
  GetRecordingStateRequestSchema,
  GetRecordingStateResponseSchema
} from '../../../shared/schemas/recording.schema'
import { NotImplementedError } from '../../../shared/types/domain-errors'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * Decisao registrada: canais registrados/tipados/validados nesta fase, mas `start`/`stop`
 * retornam `NotImplementedError` - a implementacao real (dispositivos, chunks, FFmpeg) e Fase 1
 * (Recording Core). `getState` e real desde ja (sempre IDLE nesta fase, sem captura real).
 */
export function registerRecordingHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.recording.start,
    { request: StartRecordingRequestSchema, response: StartRecordingResponseSchema },
    async () => {
      throw new NotImplementedError(
        'Gravacao real ainda nao esta implementada (Fase 1 - Recording Core).'
      )
    }
  )

  registerHandler(
    IPC_CHANNELS.recording.stop,
    { request: StopRecordingRequestSchema, response: StopRecordingResponseSchema },
    async () => {
      throw new NotImplementedError(
        'Gravacao real ainda nao esta implementada (Fase 1 - Recording Core).'
      )
    }
  )

  registerHandler(
    IPC_CHANNELS.recording.getState,
    { request: GetRecordingStateRequestSchema, response: GetRecordingStateResponseSchema },
    async () => ({ state: context.recordingStateMachine.getState() })
  )
}
