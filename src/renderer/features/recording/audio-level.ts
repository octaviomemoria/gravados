/**
 * RF-004 - "permitir teste visual de nivel" do microfone. Funcao pura (RMS normalizado 0-1) para
 * ser testavel sem precisar de um AudioContext real (jsdom nao implementa Web Audio) - a leitura
 * real dos bytes vem de `AnalyserNode.getByteTimeDomainData()` em `useAudioLevel.ts`.
 */
export function calculateAudioLevel(timeDomainData: Uint8Array): number {
  if (timeDomainData.length === 0) return 0

  let sumSquares = 0
  for (const sample of timeDomainData) {
    const normalized = (sample - 128) / 128
    sumSquares += normalized * normalized
  }

  const rms = Math.sqrt(sumSquares / timeDomainData.length)
  return Math.min(1, rms * Math.SQRT2)
}
