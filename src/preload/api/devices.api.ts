import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  ListScreenSourcesRequestSchema,
  ListScreenSourcesResponseSchema
} from '../../shared/schemas/devices.schema'
import type { DevicesApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createDevicesApi(): DevicesApi {
  return {
    listScreens: () =>
      invokeChannel(
        IPC_CHANNELS.devices.listScreens,
        { request: ListScreenSourcesRequestSchema, response: ListScreenSourcesResponseSchema },
        undefined
      )
  }
}
