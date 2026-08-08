import { useEffect, useState } from 'react'

export interface DeviceStreamState {
  stream: MediaStream | null
  error: boolean
}

/**
 * Abre (e sempre fecha) um `getUserMedia` para preview de camera ou nivel de microfone.
 * `constraints: null` significa "nenhum dispositivo selecionado" - nao abre stream nenhuma.
 * As tracks sao sempre paradas no cleanup, mesmo se `constraints` mudar rapido (evita manter a
 * luz da camera acesa ou o microfone capturando sem necessidade).
 */
export function useDeviceStream(constraints: MediaStreamConstraints | null): DeviceStreamState {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Nada selecionado: nao ha stream anterior desta execucao do efeito para limpar (o estado ja
    // comeca em `null`/`false`) - retornar sem chamar setState evita "set-state-in-effect".
    if (!constraints) {
      return
    }

    let cancelled = false
    let activeStream: MediaStream | null = null

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return
        }
        activeStream = mediaStream
        setStream(mediaStream)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
      activeStream?.getTracks().forEach((track) => track.stop())
      setStream(null)
      setError(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(constraints)])

  return { stream, error }
}
