/**
 * RF-013 - segmentacao por tamanho. Funcao pura (sem `MediaRecorder`/DOM), testavel isoladamente -
 * `useRecordingSession.ts` chama isso apos cada resposta de `recording.appendChunk` (que devolve
 * `totalBytes` do segmento ATUAL) comparando contra o limite configurado em Configuracoes
 * (`recordingPresets.sizeSegmentationMb`, `null` = sem limite).
 */
export function shouldRotateForSize(totalBytes: number, sizeLimitMb: number | null): boolean {
  if (sizeLimitMb === null) return false
  return totalBytes >= sizeLimitMb * 1024 * 1024
}
