import { useEffect, useState } from 'react'
import { ThemeToggle } from '../../components/ThemeToggle'
import {
  RecordingPresetsSettingsSchema,
  TranscriptionSettingsSchema,
  type RecordingPresetsSettings,
  type TranscriptionSettings,
  type WhisperModelId
} from '@shared/schemas/settings.schema'

const WHISPER_MODEL_OPTIONS: ReadonlyArray<{ id: WhisperModelId; label: string; hint: string }> = [
  { id: 'base', label: 'Base (~150MB)', hint: 'Mais rapido - bom equilibrio numa maquina sem GPU dedicada.' },
  { id: 'small', label: 'Small (~500MB)', hint: 'Mais preciso que Base, mais lento pra transcrever.' },
  { id: 'medium', label: 'Medium (~1,5GB)', hint: 'O mais preciso, tambem o mais lento e o maior download.' }
]

/** Converte o valor de um `<input type="number">` para o par nullable usado pelo schema. */
function parseOptionalPositiveInt(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * RF-042 - os dois limiares de disco sao OBRIGATORIOS no schema (`z.number().int().positive()`,
 * sem `.nullable()` como a segmentacao) - um campo vazio/invalido mantem o ultimo valor valido em
 * vez de virar `null` (que quebraria a validacao Zod ao salvar).
 */
function parseRequiredPositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** RF-041: configuracoes locais. Tema e persistido de verdade via IPC (`settings.app`). */
export function SettingsPage() {
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null)
  const [recordingPresets, setRecordingPresets] = useState<RecordingPresetsSettings | null>(null)
  const [transcriptionSettings, setTranscriptionSettings] = useState<TranscriptionSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.settings
      .get('app')
      .then((settings) => {
        if (cancelled) return
        const value = settings.defaultLibraryRootPath
        setLibraryRoot(typeof value === 'string' ? value : null)
      })
      .catch(() => {
        if (!cancelled) setLibraryRoot(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.settings
      .get('recordingPresets')
      .then((raw) => {
        if (!cancelled) setRecordingPresets(RecordingPresetsSettingsSchema.parse(raw))
      })
      .catch(() => {
        if (!cancelled) setRecordingPresets(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.settings
      .get('transcription')
      .then((raw) => {
        if (!cancelled) setTranscriptionSettings(TranscriptionSettingsSchema.parse(raw))
      })
      .catch(() => {
        if (!cancelled) setTranscriptionSettings(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function patchTranscriptionSettings(patch: Partial<TranscriptionSettings>): Promise<void> {
    if (!transcriptionSettings) return
    const next = { ...transcriptionSettings, ...patch }
    setTranscriptionSettings(next)
    try {
      const saved = await window.meetingStudio.settings.update('transcription', next)
      setTranscriptionSettings(TranscriptionSettingsSchema.parse(saved))
    } catch (error) {
      console.error('Falha ao salvar preferencias de transcricao', error)
    }
  }

  async function patchRecordingPresets(patch: Partial<RecordingPresetsSettings>): Promise<void> {
    if (!recordingPresets) return
    const next = { ...recordingPresets, ...patch }
    setRecordingPresets(next)
    try {
      const saved = await window.meetingStudio.settings.update('recordingPresets', next)
      setRecordingPresets(RecordingPresetsSettingsSchema.parse(saved))
    } catch (error) {
      console.error('Falha ao salvar preferencias de segmentacao', error)
    }
  }

  return (
    <div className="feature-page">
      <h1>Configuracoes</h1>

      <section className="settings-section">
        <h2>Tema</h2>
        <ThemeToggle />
      </section>

      <section className="settings-section">
        <h2>Pasta padrao da biblioteca</h2>
        <p className="settings-readonly-value">{libraryRoot ?? 'Carregando...'}</p>
      </section>

      <section className="settings-section">
        <h2>Segmentacao de gravacao</h2>
        <p className="settings-section__hint">
          Durante a gravacao, cada trilha (tela/camera/microfone/audio do sistema) e rotacionada
          automaticamente para um novo arquivo ao cruzar o limite configurado - a gravacao continua
          sem interrupcao. Deixe em branco para nao aplicar aquele limite. Se os dois estiverem
          preenchidos, o que for atingido primeiro dispara a rotacao.
        </p>
        {!recordingPresets && <p className="empty-state">Carregando...</p>}
        {recordingPresets && (
          <div className="settings-field-group">
            <label className="settings-field">
              <span>Limite de tempo (minutos)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={recordingPresets.timeSegmentationMinutes ?? ''}
                placeholder="Sem limite"
                onChange={(event) =>
                  void patchRecordingPresets({
                    timeSegmentationMinutes: parseOptionalPositiveInt(event.target.value)
                  })
                }
              />
            </label>
            <label className="settings-field">
              <span>Limite de tamanho (MB)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={recordingPresets.sizeSegmentationMb ?? ''}
                placeholder="Sem limite"
                onChange={(event) =>
                  void patchRecordingPresets({
                    sizeSegmentationMb: parseOptionalPositiveInt(event.target.value)
                  })
                }
              />
            </label>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Espaco em disco</h2>
        <p className="settings-section__hint">
          RF-042. Abaixo do limite de aviso, a gravacao mostra um alerta discreto mas continua
          normalmente. Abaixo do limite critico, a gravacao para automaticamente de forma segura
          (segmentos finalizados corretamente) - o mesmo limite critico tambem e exigido como
          margem minima para COMECAR uma gravacao nova.
        </p>
        {!recordingPresets && <p className="empty-state">Carregando...</p>}
        {recordingPresets && (
          <div className="settings-field-group">
            <label className="settings-field">
              <span>Limite de aviso (MB)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={recordingPresets.diskSpaceWarningThresholdMb}
                onChange={(event) =>
                  void patchRecordingPresets({
                    diskSpaceWarningThresholdMb: parseRequiredPositiveInt(
                      event.target.value,
                      recordingPresets.diskSpaceWarningThresholdMb
                    )
                  })
                }
              />
            </label>
            <label className="settings-field">
              <span>Limite critico (MB)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={recordingPresets.diskSpaceCriticalThresholdMb}
                onChange={(event) =>
                  void patchRecordingPresets({
                    diskSpaceCriticalThresholdMb: parseRequiredPositiveInt(
                      event.target.value,
                      recordingPresets.diskSpaceCriticalThresholdMb
                    )
                  })
                }
              />
            </label>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Transcricao</h2>
        <p className="settings-section__hint">
          Transcricao roda 100% no seu computador (Whisper local) - nenhum audio sai da maquina.
          Modelos maiores sao mais precisos, mas maiores pra baixar (uma unica vez, na primeira
          transcricao apos trocar) e mais lentos numa maquina sem placa de video dedicada.
        </p>
        {!transcriptionSettings && <p className="empty-state">Carregando...</p>}
        {transcriptionSettings && (
          <div className="settings-field-group">
            {WHISPER_MODEL_OPTIONS.map((option) => (
              <label key={option.id} className="settings-field settings-field--radio">
                <span>
                  <input
                    type="radio"
                    name="whisper-model"
                    checked={transcriptionSettings.modelId === option.id}
                    onChange={() => void patchTranscriptionSettings({ modelId: option.id })}
                  />
                  {option.label}
                </span>
                <span className="settings-section__hint">{option.hint}</span>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
