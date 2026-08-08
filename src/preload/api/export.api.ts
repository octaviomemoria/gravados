import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  StartExportRequestSchema,
  StartExportResponseSchema,
  ListExportJobsRequestSchema,
  ListExportJobsResponseSchema,
  GetExportStatusRequestSchema,
  GetExportStatusResponseSchema,
  type StartExportRequest
} from '../../shared/schemas/export.schema'
import type { ExportApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createExportApi(): ExportApi {
  return {
    start: (request: StartExportRequest) =>
      invokeChannel(
        IPC_CHANNELS.export.start,
        { request: StartExportRequestSchema, response: StartExportResponseSchema },
        request
      ),
    list: () =>
      invokeChannel(
        IPC_CHANNELS.export.list,
        { request: ListExportJobsRequestSchema, response: ListExportJobsResponseSchema },
        undefined
      ),
    getStatus: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.export.getStatus,
        { request: GetExportStatusRequestSchema, response: GetExportStatusResponseSchema },
        { id }
      )
  }
}
