import { useEffect, useState } from 'react'
import { formatGb } from '../features/recording/format-bytes'

interface DiskSpaceState {
  freeBytes: number
  totalBytes: number
}

/** RF-042: exibir espaco em disco disponivel. Consulta real via IPC (`system.getDiskSpace`). */
export function DiskSpaceIndicator() {
  const [diskSpace, setDiskSpace] = useState<DiskSpaceState | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.system
      .getDiskSpace()
      .then((result) => {
        if (!cancelled) setDiskSpace(result)
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
    <span className="disk-space-indicator">
      {formatGb(diskSpace.freeBytes)} livres de {formatGb(diskSpace.totalBytes)}
    </span>
  )
}
