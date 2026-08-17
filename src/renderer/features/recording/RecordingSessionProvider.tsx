import { useState, type ReactNode } from 'react'
import { useMediaDevices } from './useMediaDevices'
import { useDeviceStream } from './useDeviceStream'
import { useAudioLevel } from './useAudioLevel'
import { useScreenSources } from './useScreenSources'
import { useRecordingSession } from './useRecordingSession'
import { RecordingSessionContext, type RecordingSessionContextValue } from './recording-session-context'

/**
 * Refinamento pos-MVP (bug real relatado pelo usuario testando o app: "se sairmos da tela
 * enquanto gravando, a gravacao e interrompida"). Ate aqui, `useRecordingSession` (junto com a
 * selecao de dispositivos e os streams de preview de camera/microfone) era instanciado DENTRO de
 * `RecordingSetupPage` - navegar pra outra rota desmontava o componente, o que parava as tracks
 * dos streams (`useDeviceStream` sempre para no cleanup) e derrubava os refs internos do
 * `MediaRecorder` no meio da gravacao.
 *
 * A correcao e estrutural: este Provider e montado UMA UNICA VEZ em `App.tsx`, num nivel que
 * NUNCA desmonta com a navegacao (irmao das rotas, nao filho delas) - a sessao de gravacao (e os
 * streams que ela depende) agora sobrevive a qualquer troca de tela. `RecordingSetupPage` passa a
 * ser um consumidor fino deste contexto (mesmo JSX de antes, so troca `useX()` local por
 * `useRecordingSessionContext()`); um `RecordingStatusBar` novo, montado no `AppShell` (tambem
 * nunca desmonta), mostra REC/pausar/parar em QUALQUER tela enquanto uma sessao estiver ativa.
 */
export function RecordingSessionProvider({ children }: { children: ReactNode }) {
  const { cameras, microphones, permissionDenied, loading: devicesLoading } = useMediaDevices()
  const { sources: screenSources, error: screenSourcesError } = useScreenSources()

  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null)
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(false)

  const { stream: cameraStream, error: cameraError } = useDeviceStream(
    selectedCameraId ? { video: { deviceId: { exact: selectedCameraId } } } : null
  )
  const { stream: micStream, error: micError } = useDeviceStream(
    selectedMicId ? { audio: { deviceId: { exact: selectedMicId } } } : null
  )
  const micLevel = useAudioLevel(micStream)

  // RF-005: a API do Chromium exige uma fonte de video do tipo tela (nunca janela) emparelhada
  // com a captura de audio loopback (ver `acquireSystemAudioStream`) - independente de qual tela
  // o usuario escolheu gravar como video (`selectedScreenId`, pode ate ser nenhuma).
  const systemAudioCarrierSourceId =
    systemAudioEnabled ? (screenSources?.find((source) => source.kind === 'screen')?.id ?? null) : null

  const recordingSession = useRecordingSession({
    microphone: micStream,
    camera: cameraStream,
    screenSourceId: selectedScreenId,
    systemAudioCarrierSourceId
  })

  // `paused` inclusa deliberadamente - a selecao de fontes fica travada durante toda a sessao
  // ativa (gravando OU pausada), so libera de novo apos `stop()` (RF-010: pausar nao permite
  // trocar fonte no meio, so suspende/retoma as trilhas ja escolhidas).
  const isRecording =
    recordingSession.status === 'recording' ||
    recordingSession.status === 'paused' ||
    recordingSession.status === 'stopping'

  const value: RecordingSessionContextValue = {
    cameras,
    microphones,
    permissionDenied,
    devicesLoading,
    screenSources,
    screenSourcesError,
    selectedScreenId,
    setSelectedScreenId,
    selectedCameraId,
    setSelectedCameraId,
    selectedMicId,
    setSelectedMicId,
    systemAudioEnabled,
    setSystemAudioEnabled,
    systemAudioCarrierSourceId,
    cameraStream,
    cameraError,
    micStream,
    micError,
    micLevel,
    recordingSession,
    isRecording
  }

  return <RecordingSessionContext.Provider value={value}>{children}</RecordingSessionContext.Provider>
}
