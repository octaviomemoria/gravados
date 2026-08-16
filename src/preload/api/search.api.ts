import { IPC_CHANNELS } from '../../shared/contracts/channels'
import { SearchTranscriptsRequestSchema, SearchTranscriptsResponseSchema } from '../../shared/schemas/search.schema'
import type { SearchApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createSearchApi(): SearchApi {
  return {
    transcripts: (query: string, projectId?: string, offset?: number) =>
      invokeChannel(
        IPC_CHANNELS.search.transcripts,
        { request: SearchTranscriptsRequestSchema, response: SearchTranscriptsResponseSchema },
        { query, projectId, offset: offset ?? 0 }
      )
  }
}
