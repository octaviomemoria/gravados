import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  StartTranscriptionRequestSchema,
  StartTranscriptionResponseSchema,
  ListTranscriptionJobsRequestSchema,
  ListTranscriptionJobsResponseSchema,
  GetTranscriptionStatusRequestSchema,
  GetTranscriptionStatusResponseSchema,
  GetTranscriptRequestSchema,
  GetTranscriptResponseSchema
} from '../../shared/schemas/transcription.schema'
import type { TranscriptionApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createTranscriptionApi(): TranscriptionApi {
  return {
    start: (projectId: string, language?: string) =>
      invokeChannel(
        IPC_CHANNELS.transcription.start,
        { request: StartTranscriptionRequestSchema, response: StartTranscriptionResponseSchema },
        { projectId, language }
      ),
    list: (projectId: string) =>
      invokeChannel(
        IPC_CHANNELS.transcription.list,
        { request: ListTranscriptionJobsRequestSchema, response: ListTranscriptionJobsResponseSchema },
        { projectId }
      ),
    getStatus: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.transcription.getStatus,
        { request: GetTranscriptionStatusRequestSchema, response: GetTranscriptionStatusResponseSchema },
        { id }
      ),
    getTranscript: (projectId: string) =>
      invokeChannel(
        IPC_CHANNELS.transcription.getTranscript,
        { request: GetTranscriptRequestSchema, response: GetTranscriptResponseSchema },
        { projectId }
      )
  }
}
