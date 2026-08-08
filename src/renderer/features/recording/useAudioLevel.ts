import { useEffect, useState } from 'react'
import { calculateAudioLevel } from './audio-level'

const FFT_SIZE = 512

/** RF-004 - medidor de nivel visual do microfone selecionado, atualizado via `requestAnimationFrame`. */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    // Sem stream: nao ha nada desta execucao do efeito para limpar (o estado ja comeca em 0) -
    // retornar sem chamar setState evita "set-state-in-effect".
    if (!stream || stream.getAudioTracks().length === 0) {
      return
    }

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = FFT_SIZE
    source.connect(analyser)

    const buffer = new Uint8Array(analyser.frequencyBinCount)
    let frameId: number

    const tick = (): void => {
      analyser.getByteTimeDomainData(buffer)
      setLevel(calculateAudioLevel(buffer))
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frameId)
      source.disconnect()
      void audioContext.close()
      setLevel(0)
    }
  }, [stream])

  return level
}
