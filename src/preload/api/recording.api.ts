import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  StartRecordingRequestSchema,
  StartRecordingResponseSchema,
  AppendRecordingChunkRequestSchema,
  AppendRecordingChunkResponseSchema,
  StopRecordingRequestSchema,
  StopRecordingResponseSchema,
  GetRecordingStateRequestSchema,
  GetRecordingStateResponseSchema,
  type StartRecordingRequest,
  type AppendRecordingChunkRequest,
  type StopRecordingRequest
} from '../../shared/schemas/recording.schema'
import type { RecordingApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createRecordingApi(): RecordingApi {
  return {
    start: (request: StartRecordingRequest) =>
      invokeChannel(
        IPC_CHANNELS.recording.start,
        { request: StartRecordingRequestSchema, response: StartRecordingResponseSchema },
        request
      ),
    appendChunk: (request: AppendRecordingChunkRequest) =>
      invokeChannel(
        IPC_CHANNELS.recording.appendChunk,
        { request: AppendRecordingChunkRequestSchema, response: AppendRecordingChunkResponseSchema },
        request
      ),
    stop: (request: StopRecordingRequest) =>
      invokeChannel(
        IPC_CHANNELS.recording.stop,
        { request: StopRecordingRequestSchema, response: StopRecordingResponseSchema },
        request
      ),
    getState: () =>
      invokeChannel(
        IPC_CHANNELS.recording.getState,
        { request: GetRecordingStateRequestSchema, response: GetRecordingStateResponseSchema },
        undefined
      )
  }
}
