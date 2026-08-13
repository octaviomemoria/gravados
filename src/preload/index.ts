import { contextBridge } from 'electron'
import { createProjectApi } from './api/project.api'
import { createSettingsApi } from './api/settings.api'
import { createRecordingApi } from './api/recording.api'
import { createMarkersApi } from './api/markers.api'
import { createExportApi } from './api/export.api'
import { createSystemApi } from './api/system.api'
import { createDevicesApi } from './api/devices.api'
import type { MeetingStudioApi } from '../shared/types/preload-api'

const projectApi = createProjectApi()

/**
 * `library` e um alias somente-leitura de `project` (mesmos canais IPC por baixo) - preserva o
 * nome usado no exemplo conceitual de 03_TECHNICAL_ARCHITECTURE.md (`library.list()`) ao lado da
 * nomenclatura de entidade usada em todo o schema/banco (`projects`).
 */
const meetingStudioApi: MeetingStudioApi = {
  project: projectApi,
  library: {
    list: projectApi.list,
    get: projectApi.get
  },
  settings: createSettingsApi(),
  recording: createRecordingApi(),
  markers: createMarkersApi(),
  export: createExportApi(),
  system: createSystemApi(),
  devices: createDevicesApi()
}

// Nunca expor `ipcRenderer` generico diretamente - apenas esta API tipada e validada.
contextBridge.exposeInMainWorld('meetingStudio', meetingStudioApi)
