import type { AppContext } from '../app-context'
import { registerProjectHandlers } from './handlers/project.handlers'
import { registerSettingsHandlers } from './handlers/settings.handlers'
import { registerRecordingHandlers } from './handlers/recording.handlers'
import { registerExportHandlers } from './handlers/export.handlers'
import { registerSystemHandlers } from './handlers/system.handlers'
import { registerDevicesHandlers } from './handlers/devices.handlers'

export function registerAllIpcHandlers(context: AppContext): void {
  registerProjectHandlers(context)
  registerSettingsHandlers(context)
  registerRecordingHandlers(context)
  registerExportHandlers(context)
  registerSystemHandlers(context)
  registerDevicesHandlers()
}
