import { app } from 'electron'
import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  GetAppInfoRequestSchema,
  GetAppInfoResponseSchema,
  GetDiskSpaceRequestSchema,
  GetDiskSpaceResponseSchema
} from '../../../shared/schemas/system.schema'
import { APP_NAME } from '../../../shared/constants/app-info'
import { getDiskSpace } from '../../services/disk-space.service'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

export function registerSystemHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.system.getAppInfo,
    { request: GetAppInfoRequestSchema, response: GetAppInfoResponseSchema },
    async () => ({ name: APP_NAME, version: app.getVersion(), platform: process.platform })
  )

  registerHandler(
    IPC_CHANNELS.system.getDiskSpace,
    { request: GetDiskSpaceRequestSchema, response: GetDiskSpaceResponseSchema },
    async (request) => {
      const target = request.path ?? context.settingsService.get('app').defaultLibraryRootPath
      return getDiskSpace(target)
    }
  )
}
