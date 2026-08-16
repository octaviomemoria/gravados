import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  ListMarkersRequestSchema,
  ListMarkersResponseSchema,
  UpdateMarkerRequestSchema,
  UpdateMarkerResponseSchema,
  DeleteMarkerRequestSchema,
  DeleteMarkerResponseSchema
} from '../../shared/schemas/markers.schema'
import type { MarkersApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createMarkersApi(): MarkersApi {
  return {
    list: (projectId: string) =>
      invokeChannel(
        IPC_CHANNELS.markers.list,
        { request: ListMarkersRequestSchema, response: ListMarkersResponseSchema },
        { projectId }
      ),
    update: (id: string, patch: { title?: string | null; note?: string | null }) =>
      invokeChannel(
        IPC_CHANNELS.markers.update,
        { request: UpdateMarkerRequestSchema, response: UpdateMarkerResponseSchema },
        { id, ...patch }
      ),
    delete: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.markers.delete,
        { request: DeleteMarkerRequestSchema, response: DeleteMarkerResponseSchema },
        { id }
      )
  }
}
