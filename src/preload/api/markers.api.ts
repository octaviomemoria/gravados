import { IPC_CHANNELS } from '../../shared/contracts/channels'
import { ListMarkersRequestSchema, ListMarkersResponseSchema } from '../../shared/schemas/markers.schema'
import type { MarkersApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createMarkersApi(): MarkersApi {
  return {
    list: (projectId: string) =>
      invokeChannel(
        IPC_CHANNELS.markers.list,
        { request: ListMarkersRequestSchema, response: ListMarkersResponseSchema },
        { projectId }
      )
  }
}
