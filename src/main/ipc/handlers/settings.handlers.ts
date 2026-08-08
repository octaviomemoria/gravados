import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  GetSettingsRequestSchema,
  GetSettingsResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema
} from '../../../shared/schemas/settings.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/** RF-041: configuracoes locais persistidas. Handlers reais nesta fase. */
export function registerSettingsHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.settings.get,
    { request: GetSettingsRequestSchema, response: GetSettingsResponseSchema },
    async (request) => context.settingsService.get(request.category)
  )

  registerHandler(
    IPC_CHANNELS.settings.update,
    { request: UpdateSettingsRequestSchema, response: UpdateSettingsResponseSchema },
    async (request) =>
      context.settingsService.update(request.category, request.value, new Date().toISOString())
  )
}
