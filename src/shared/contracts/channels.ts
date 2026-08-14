/**
 * Fonte unica de nomes de canal IPC, consumida por `preload/` e `main/ipc/`.
 * 03_TECHNICAL_ARCHITECTURE.md exemplifica a API futura como
 * `window.meetingStudio.recording.start()`, `.stop()`, `library.list()`, `export.start()` - os
 * nomes de canal abaixo espelham essa mesma estrutura por dominio.
 */
export const IPC_CHANNELS = {
  project: {
    create: 'project.create',
    list: 'project.list',
    get: 'project.get',
    getDetails: 'project.getDetails',
    openFolder: 'project.openFolder',
    rename: 'project.rename',
    delete: 'project.delete'
  },
  settings: {
    get: 'settings.get',
    update: 'settings.update'
  },
  recording: {
    start: 'recording.start',
    appendChunk: 'recording.appendChunk',
    pause: 'recording.pause',
    resume: 'recording.resume',
    addMarker: 'recording.addMarker',
    stop: 'recording.stop',
    getState: 'recording.getState'
  },
  markers: {
    list: 'markers.list'
  },
  recovery: {
    repair: 'recovery.repair'
  },
  editor: {
    create: 'editor.create',
    get: 'editor.get',
    list: 'editor.list',
    getTimeline: 'editor.getTimeline',
    getEditedTimeline: 'editor.getEditedTimeline',
    removeRange: 'editor.removeRange',
    undo: 'editor.undo',
    redo: 'editor.redo',
    setTrackGain: 'editor.setTrackGain'
  },
  export: {
    start: 'export.start',
    list: 'export.list',
    getStatus: 'export.getStatus'
  },
  system: {
    getAppInfo: 'system.getAppInfo',
    getDiskSpace: 'system.getDiskSpace'
  },
  devices: {
    listScreens: 'devices.listScreens'
  }
} as const

export type IpcErrorPayload = {
  code: string
  message: string
  metadata?: Record<string, unknown>
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload }
