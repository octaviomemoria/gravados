import type { AppContext } from '../app-context'
import { registerProjectHandlers } from './handlers/project.handlers'
import { registerSettingsHandlers } from './handlers/settings.handlers'
import { registerRecordingHandlers } from './handlers/recording.handlers'
import { registerMarkersHandlers } from './handlers/markers.handlers'
import { registerRecoveryHandlers } from './handlers/recovery.handlers'
import { registerEditorHandlers } from './handlers/editor.handlers'
import { registerExportHandlers } from './handlers/export.handlers'
import { registerTranscriptionHandlers } from './handlers/transcription.handlers'
import { registerSystemHandlers } from './handlers/system.handlers'
import { registerDevicesHandlers } from './handlers/devices.handlers'

export function registerAllIpcHandlers(context: AppContext): void {
  registerProjectHandlers(context)
  registerSettingsHandlers(context)
  registerRecordingHandlers(context)
  registerMarkersHandlers(context)
  registerRecoveryHandlers(context)
  registerEditorHandlers(context)
  registerExportHandlers(context)
  registerTranscriptionHandlers(context)
  registerSystemHandlers(context)
  registerDevicesHandlers()
}
