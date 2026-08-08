import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  GetAppInfoRequestSchema,
  GetAppInfoResponseSchema,
  GetDiskSpaceRequestSchema,
  GetDiskSpaceResponseSchema
} from '../../shared/schemas/system.schema'
import type { SystemApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createSystemApi(): SystemApi {
  return {
    getAppInfo: () =>
      invokeChannel(
        IPC_CHANNELS.system.getAppInfo,
        { request: GetAppInfoRequestSchema, response: GetAppInfoResponseSchema },
        undefined
      ),
    getDiskSpace: (path?: string) =>
      invokeChannel(
        IPC_CHANNELS.system.getDiskSpace,
        { request: GetDiskSpaceRequestSchema, response: GetDiskSpaceResponseSchema },
        { path }
      )
  }
}
