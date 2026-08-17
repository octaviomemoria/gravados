import { createContext, useContext } from 'react'
import type { MediaDeviceOption } from './useMediaDevices'
import type { useRecordingSession } from './useRecordingSession'
import type { ScreenSource } from '@shared/schemas/devices.schema'

/** Separado de `RecordingSessionProvider.tsx` (que so exporta o componente Provider) porque
 * `react-refresh/only-export-components` exige que um arquivo de componente React so exporte
 * componentes - o Context/hook/tipos ficam aqui. */
export interface RecordingSessionContextValue {
  cameras: MediaDeviceOption[]
  microphones: MediaDeviceOption[]
  permissionDenied: boolean
  devicesLoading: boolean
  screenSources: ScreenSource[] | null
  screenSourcesError: boolean

  selectedScreenId: string | null
  setSelectedScreenId: (id: string | null) => void
  selectedCameraId: string | null
  setSelectedCameraId: (id: string | null) => void
  selectedMicId: string | null
  setSelectedMicId: (id: string | null) => void
  systemAudioEnabled: boolean
  setSystemAudioEnabled: (enabled: boolean) => void
  systemAudioCarrierSourceId: string | null

  cameraStream: MediaStream | null
  cameraError: boolean
  micStream: MediaStream | null
  micError: boolean
  micLevel: number

  recordingSession: ReturnType<typeof useRecordingSession>
  isRecording: boolean
}

export const RecordingSessionContext = createContext<RecordingSessionContextValue | null>(null)

export function useRecordingSessionContext(): RecordingSessionContextValue {
  const context = useContext(RecordingSessionContext)
  if (!context) {
    throw new Error('useRecordingSessionContext precisa estar dentro de <RecordingSessionProvider>.')
  }
  return context
}
