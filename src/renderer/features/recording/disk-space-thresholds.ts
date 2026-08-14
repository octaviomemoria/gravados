export type DiskSpaceStatus = 'ok' | 'warning' | 'critical'

/**
 * RF-042 - monitor de espaco em disco. Funcao pura (sem IPC/DOM), testavel isoladamente -
 * `useRecordingSession.ts` chama isso a cada tick do polling periodico durante uma sessao ativa,
 * comparando o espaco livre atual contra os dois limiares configurados em Configuracoes
 * (`recordingPresets.diskSpaceWarningThresholdMb`/`.diskSpaceCriticalThresholdMb`, ambos em MB).
 * `critical` tambem funciona como o nivel "stop-safe" de 04_RECORDING_ENGINE.md secao 11 - abaixo
 * dele o renderer para a gravacao automaticamente (ver `useRecordingSession.ts`).
 */
export function classifyDiskSpace(
  freeBytes: number,
  warningThresholdMb: number,
  criticalThresholdMb: number
): DiskSpaceStatus {
  if (freeBytes < criticalThresholdMb * 1024 * 1024) return 'critical'
  if (freeBytes < warningThresholdMb * 1024 * 1024) return 'warning'
  return 'ok'
}
