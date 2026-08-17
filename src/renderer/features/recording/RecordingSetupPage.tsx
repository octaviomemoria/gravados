import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { CameraPreview } from './CameraPreview'
import { LevelMeter } from './LevelMeter'
import { RecordingControls } from './RecordingControls'
import { useMediaDevices } from './useMediaDevices'
import { useDeviceStream } from './useDeviceStream'
import { useAudioLevel } from './useAudioLevel'
import { useScreenSources } from './useScreenSources'
import { useRecordingSession } from './useRecordingSession'

/**
 * RF-002/RF-003/RF-004/RF-005/RF-006/RF-007/RF-008/RF-009/RF-010/RF-016/RF-043 + MVP-AC-001.
 * Escopo deliberado (Fase 1): captura real de tela, camera, microfone E audio do sistema,
 * simultaneas e independentes, com segmentacao por tempo/tamanho, pausar/retomar e marcadores
 * (ver README "Decisoes de arquitetura"). Qualidade/layout ficam para depois.
 */
export function RecordingSetupPage() {
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

  return (
    <div className="feature-page">
      <h1>Nova gravacao</h1>

      {permissionDenied && (
        <EmptyState message="Permissao de camera/microfone negada. Verifique as configuracoes de privacidade do Windows e tente novamente." />
      )}

      <section className="setup-group">
        <h2>Fonte de video</h2>

        <h3 className="setup-group__subtitle">Tela ou janela</h3>
        {screenSourcesError && (
          <EmptyState message="Nao foi possivel listar telas/janelas disponiveis." />
        )}
        {!screenSourcesError && !screenSources && (
          <p className="empty-state">Procurando telas e janelas...</p>
        )}
        {!screenSourcesError && screenSources && screenSources.length === 0 && (
          <EmptyState message="Nenhuma tela ou janela disponivel para captura." />
        )}
        {screenSources && screenSources.length > 0 && (
          <div className="screen-source-grid">
            {screenSources.map((source) => (
              <button
                key={source.id}
                type="button"
                className={
                  'screen-source-card' +
                  (selectedScreenId === source.id ? ' screen-source-card--selected' : '')
                }
                onClick={() => setSelectedScreenId(source.id)}
                aria-pressed={selectedScreenId === source.id}
                disabled={isRecording}
              >
                <img src={source.thumbnailDataUrl} alt="" className="screen-source-card__thumbnail" />
                <span className="screen-source-card__name">{source.name}</span>
              </button>
            ))}
          </div>
        )}

        <h3 className="setup-group__subtitle">Camera</h3>
        {!devicesLoading && cameras.length === 0 && !permissionDenied && (
          <EmptyState message="Nenhuma camera encontrada." />
        )}
        {cameras.length > 0 && (
          <select
            className="device-select"
            aria-label="Camera"
            value={selectedCameraId ?? ''}
            onChange={(event) => setSelectedCameraId(event.target.value || null)}
            disabled={isRecording}
          >
            <option value="">Sem camera</option>
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label}
              </option>
            ))}
          </select>
        )}
        {cameraError && <EmptyState message="Nao foi possivel iniciar a pre-visualizacao da camera." />}
        <CameraPreview stream={cameraStream} />
      </section>

      <section className="setup-group">
        <h2>Fonte de audio</h2>

        <h3 className="setup-group__subtitle">Microfone</h3>
        {!devicesLoading && microphones.length === 0 && !permissionDenied && (
          <EmptyState message="Nenhum microfone encontrado." />
        )}
        {microphones.length > 0 && (
          <select
            className="device-select"
            aria-label="Microfone"
            value={selectedMicId ?? ''}
            onChange={(event) => setSelectedMicId(event.target.value || null)}
            disabled={isRecording}
          >
            <option value="">Sem microfone</option>
            {microphones.map((microphone) => (
              <option key={microphone.deviceId} value={microphone.deviceId}>
                {microphone.label}
              </option>
            ))}
          </select>
        )}
        {micError && <EmptyState message="Nao foi possivel testar o nivel deste microfone." />}
        <LevelMeter level={micLevel} />

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={systemAudioEnabled}
            onChange={(event) => setSystemAudioEnabled(event.target.checked)}
            disabled={isRecording}
          />
          Audio do sistema (quando suportado pela plataforma)
        </label>
      </section>

      <RecordingControls
        status={recordingSession.status}
        elapsedMs={recordingSession.elapsedMs}
        error={recordingSession.error}
        canStart={
          Boolean(selectedMicId) ||
          Boolean(selectedCameraId) ||
          Boolean(selectedScreenId) ||
          Boolean(systemAudioCarrierSourceId)
        }
        markerCount={recordingSession.markers.length}
        diskSpaceStatus={recordingSession.diskSpaceStatus}
        freeDiskBytes={recordingSession.freeDiskBytes}
        systemAudioUnavailable={recordingSession.systemAudioUnavailable}
        onStart={(title) => void recordingSession.start(title)}
        onStop={() => void recordingSession.stop()}
        onPause={() => void recordingSession.pause()}
        onResume={() => void recordingSession.resume()}
        onAddMarker={(title, note) => void recordingSession.addMarker(title, note)}
      />
    </div>
  )
}
