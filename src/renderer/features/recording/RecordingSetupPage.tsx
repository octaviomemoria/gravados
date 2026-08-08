import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { CameraPreview } from './CameraPreview'
import { LevelMeter } from './LevelMeter'
import { useMediaDevices } from './useMediaDevices'
import { useDeviceStream } from './useDeviceStream'
import { useAudioLevel } from './useAudioLevel'
import { useScreenSources } from './useScreenSources'

/**
 * RF-002/RF-003/RF-004/RF-008 + MVP-AC-001 ("visualizar e selecionar as fontes"). Escopo
 * deliberado desta etapa (Fase 1, primeiro incremento): selecionar e pre-visualizar fontes.
 * Qualidade/segmentacao/layout (tambem mostrados no mockup de 08_UX_FLOWS.md secao 3) e o botao
 * "Iniciar gravacao" chegam com a captura real (proximo incremento da Fase 1) - `recording.start`
 * ainda retorna `NotImplementedError` no backend.
 */
export function RecordingSetupPage() {
  const { cameras, microphones, permissionDenied, loading: devicesLoading } = useMediaDevices()
  const { sources: screenSources, error: screenSourcesError } = useScreenSources()

  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null)

  const { stream: cameraStream, error: cameraError } = useDeviceStream(
    selectedCameraId ? { video: { deviceId: { exact: selectedCameraId } } } : null
  )
  const { stream: micStream, error: micError } = useDeviceStream(
    selectedMicId ? { audio: { deviceId: { exact: selectedMicId } } } : null
  )
  const micLevel = useAudioLevel(micStream)

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
            value={selectedCameraId ?? ''}
            onChange={(event) => setSelectedCameraId(event.target.value || null)}
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
            value={selectedMicId ?? ''}
            onChange={(event) => setSelectedMicId(event.target.value || null)}
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
      </section>
    </div>
  )
}
