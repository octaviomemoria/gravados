import { useEffect, useState } from 'react'
import { formatGb } from '../features/recording/format-bytes'
import { classifyDiskSpace, type DiskSpaceStatus } from '../features/recording/disk-space-thresholds'
import { RecordingPresetsSettingsSchema } from '@shared/schemas/settings.schema'

interface DiskSpaceState {
  freeBytes: number
  totalBytes: number
}

/** Refinamento pos-RF-042 - resolve a pendencia registrada desde o monitor de espaco em disco:
 * o texto sempre mostrava so o numero de GB livres, sem nenhum indicador visual explicito de
 * "espaco OK" (so havia o BANNER de aviso, exibido apenas durante uma gravacao ativa via
 * `useRecordingSession`, quando o espaco ja estava baixo). Reusa a MESMA funcao pura
 * (`classifyDiskSpace`) e os MESMOS limiares configurados em Configuracoes
 * (`recordingPresets.diskSpaceWarningThresholdMb`/`.diskSpaceCriticalThresholdMb`) - nunca duplica
 * a logica de classificacao, so passa a mostrar o resultado mesmo fora de uma gravacao. */
const STATUS_LABELS: Record<DiskSpaceStatus, string> = {
  ok: 'Espaco OK',
  warning: 'Espaco baixo',
  critical: 'Espaco critico'
}

export function DiskSpaceIndicator() {
  const [diskSpace, setDiskSpace] = useState<DiskSpaceState | null>(null)
  const [status, setStatus] = useState<DiskSpaceStatus | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.system
      .getDiskSpace()
      .then((diskSpaceResult) => {
        if (cancelled) return
        setDiskSpace(diskSpaceResult)
        // O selo de status e um extra opcional sobre o dado principal (GB livres, sempre
        // confiavel vindo direto do IPC acima) - buscado numa promise SEPARADA, com seu proprio
        // catch, pra uma falha aqui (settings indisponivel, parse invalido) nunca derrubar o
        // numero que ja carregou. `?.` defensivo tambem cobre um `window.meetingStudio` parcial
        // (ex.: um teste que so mocka `system.getDiskSpace`).
        Promise.resolve(window.meetingStudio.settings?.get('recordingPresets'))
          .then((presetsRaw) => {
            if (presetsRaw === undefined) return
            if (cancelled) return
            const presets = RecordingPresetsSettingsSchema.safeParse(presetsRaw)
            if (presets.success) {
              setStatus(
                classifyDiskSpace(
                  diskSpaceResult.freeBytes,
                  presets.data.diskSpaceWarningThresholdMb,
                  presets.data.diskSpaceCriticalThresholdMb
                )
              )
            }
          })
          .catch(() => {
            // Selo de status fica de fora - nao e um erro fatal pro indicador.
          })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) return null
  if (!diskSpace) {
    return <span className="disk-space-indicator">Verificando espaco em disco...</span>
  }

  return (
    <span className={`disk-space-indicator${status ? ` disk-space-indicator--${status}` : ''}`}>
      {formatGb(diskSpace.freeBytes)} livres de {formatGb(diskSpace.totalBytes)}
      {status && <span className="disk-space-indicator__badge">{STATUS_LABELS[status]}</span>}
    </span>
  )
}
