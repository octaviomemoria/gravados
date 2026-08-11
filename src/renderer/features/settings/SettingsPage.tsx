import { useEffect, useState } from 'react'
import { ThemeToggle } from '../../components/ThemeToggle'
import {
  RecordingPresetsSettingsSchema,
  type RecordingPresetsSettings
} from '@shared/schemas/settings.schema'

/** Converte o valor de um `<input type="number">` para o par nullable usado pelo schema. */
function parseOptionalPositiveInt(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** RF-041: configuracoes locais. Tema e persistido de verdade via IPC (`settings.app`). */
export function SettingsPage() {
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null)
  const [recordingPresets, setRecordingPresets] = useState<RecordingPresetsSettings | null>(null)

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
    </div>
  )
}
