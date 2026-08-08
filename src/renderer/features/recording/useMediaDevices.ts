import { useEffect, useState } from 'react'

export interface MediaDeviceOption {
  deviceId: string
  label: string
}

export interface MediaDevicesState {
  cameras: MediaDeviceOption[]
  microphones: MediaDeviceOption[]
  permissionDenied: boolean
  loading: boolean
}

const INITIAL_STATE: MediaDevicesState = {
  cameras: [],
  microphones: [],
  permissionDenied: false,
  loading: true
}

/**
 * RF-003/RF-004: enumera cameras/microfones via `navigator.mediaDevices` (API web padrao) -
 * roda inteiramente no renderer, sem IPC. Os rotulos (`label`) so vem preenchidos apos permissao
 * concedida, por isso pedimos `getUserMedia` uma vez (audio+video) so para "destravar" os
 * rotulos, encerrando as tracks imediatamente em seguida (nao mantemos captura ligada aqui).
 * Se a permissao for negada, retorna listas vazias com `permissionDenied: true` em vez de travar
 * (MVP-AC-014: "acesso negado -> orientacao, nunca travar").
 */
export function useMediaDevices(): MediaDevicesState {
  const [state, setState] = useState<MediaDevicesState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const primingStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        primingStream.getTracks().forEach((track) => track.stop())

        const devices = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return

        setState({
          cameras: devices
            .filter((device) => device.kind === 'videoinput')
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Camera ${index + 1}`
            })),
          microphones: devices
            .filter((device) => device.kind === 'audioinput')
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Microfone ${index + 1}`
            })),
          permissionDenied: false,
          loading: false
        })
      } catch {
        if (!cancelled) {
          setState({ cameras: [], microphones: [], permissionDenied: true, loading: false })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
