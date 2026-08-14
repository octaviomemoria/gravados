/**
 * Formatacao compartilhada de bytes -> GB. Extraida de `DiskSpaceIndicator.tsx` (RF-042, Home)
 * neste incremento para ser reaproveitada por `RecordingControls.tsx` (RF-042, monitor de disco
 * durante a gravacao) sem duplicar a mesma conta em dois lugares.
 */
export function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
