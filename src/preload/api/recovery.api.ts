import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  RepairProjectRequestSchema,
  RepairProjectResponseSchema
} from '../../shared/schemas/recovery.schema'
import type { RecoveryApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createRecoveryApi(): RecoveryApi {
  return {
    repair: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.recovery.repair,
        { request: RepairProjectRequestSchema, response: RepairProjectResponseSchema },
        { id }
      )
  }
}
