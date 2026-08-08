import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  ListScreenSourcesRequestSchema,
  ListScreenSourcesResponseSchema
} from '../../../shared/schemas/devices.schema'
import { registerHandler } from '../ipc-handler'
import { listScreenSources } from '../../media/screen-sources'

/** RF-002 (telas). Camera/microfone (RF-003/RF-004) sao enumerados no renderer via
 * `navigator.mediaDevices` - API web padrao, sem necessidade de IPC. */
export function registerDevicesHandlers(): void {
  registerHandler(
    IPC_CHANNELS.devices.listScreens,
    { request: ListScreenSourcesRequestSchema, response: ListScreenSourcesResponseSchema },
    async () => listScreenSources()
  )
}
