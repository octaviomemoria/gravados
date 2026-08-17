import { EmptyState } from '../../components/EmptyState'
import { CameraPreview } from './CameraPreview'
import { LevelMeter } from './LevelMeter'
import { RecordingControls } from './RecordingControls'
import { useRecordingSessionContext } from './recording-session-context'

/**
 * RF-002/RF-003/RF-004/RF-005/RF-006/RF-007/RF-008/RF-009/RF-010/RF-016/RF-043 + MVP-AC-001.
 * Escopo deliberado (Fase 1): captura real de tela, camera, microfone E audio do sistema,
 * simultaneas e independentes, com segmentacao por tempo/tamanho, pausar/retomar e marcadores
 * (ver README "Decisoes de arquitetura").
 *
 * Refinamento pos-MVP: este componente e so a UI de SETUP (escolher fontes + controles) - o
 * estado real da sessao (streams, `MediaRecorder`s, refs) vive em `RecordingSessionProvider`,
 * montado uma unica vez em `App.tsx`, fora da arvore de rotas - navegar pra outra tela NUNCA
 * mais interrompe uma gravacao em andamento (ver comentario completo la).
 */
export function RecordingSetupPage() {
  const {
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
    micError,
    micLevel,
    recordingSession,
    isRecording
  } = useRecordingSessionContext()

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
