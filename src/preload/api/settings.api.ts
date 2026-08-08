import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  GetSettingsRequestSchema,
  GetSettingsResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema,
  type SettingsCategory
} from '../../shared/schemas/settings.schema'
import type { SettingsApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createSettingsApi(): SettingsApi {
  return {
    get: (category: SettingsCategory) =>
      invokeChannel(
        IPC_CHANNELS.settings.get,
        { request: GetSettingsRequestSchema, response: GetSettingsResponseSchema },
        { category }
      ),
    update: (category: SettingsCategory, value: Record<string, unknown>) =>
      invokeChannel(
        IPC_CHANNELS.settings.update,
        { request: UpdateSettingsRequestSchema, response: UpdateSettingsResponseSchema },
        { category, value }
      )
  }
}
