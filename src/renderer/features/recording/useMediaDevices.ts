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

const RETRY_DELAY_MS = 250
// 12 tentativas x 250ms = ate 3s de margem extra. So se paga esse custo quando um tipo de
// dispositivo esperado ainda nao apareceu (caso comum: enumeracao completa na 1a tentativa, custo
// zero). Ajustado para cima apos observar que o orçamento anterior (1.5s) nao bastava sob picos
// de carga do sistema durante testes E2E.
const MAX_ENUMERATE_ATTEMPTS = 12

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * `enumerateDevices()` chamado logo apos `getUserMedia()` conceder uma track pode, ocasionalmente,
 * ainda nao listar o dispositivo correspondente (observado de forma intermitente com dispositivos
 * recem-conectados e com o dispositivo sintetico usado em testes E2E logo apos o app abrir).
 * Reenumera algumas vezes (com atraso curto) ate que o tipo de dispositivo que sabemos ter sido
 * concedido (`expectVideo`/`expectAudio`, a partir das tracks reais da priming stream) apareca -
 * no caso comum (enumeracao ja completa na primeira chamada) isso nao adiciona latencia alguma.
 */
async function enumerateWithRetry(
  expectVideo: boolean,
  expectAudio: boolean
): Promise<MediaDeviceInfo[]> {
  let devices = await navigator.mediaDevices.enumerateDevices()
  for (let attempt = 1; attempt < MAX_ENUMERATE_ATTEMPTS; attempt++) {
    const hasVideo = !expectVideo || devices.some((device) => device.kind === 'videoinput')
    const hasAudio = !expectAudio || devices.some((device) => device.kind === 'audioinput')
    if (hasVideo && hasAudio) break
    await wait(RETRY_DELAY_MS)
    devices = await navigator.mediaDevices.enumerateDevices()
  }
  return devices
}

/**
 * RF-003/RF-004: enumera cameras/microfones via `navigator.mediaDevices` (API web padrao) -
 * roda inteiramente no renderer, sem IPC. Os rotulos (`label`) so vem preenchidos apos permissao
 * concedida, por isso pedimos `getUserMedia` uma vez (audio+video) so para "destravar" os
 * rotulos. Enumera ANTES de parar as tracks (nao depois) - parar a track antes de enumerar
 * mostrou-se uma corrida real: o encerramento pode deixar o estado do dispositivo momentaneamente
 * inconsistente. Nao mantemos a captura ligada - as tracks sao paradas assim que a enumeracao
 * termina. Se a permissao for negada, retorna listas vazias com `permissionDenied: true` em vez
 * de travar (MVP-AC-014: "acesso negado -> orientacao, nunca travar").
 */
export function useMediaDevices(): MediaDevicesState {
  const [state, setState] = useState<MediaDevicesState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      let primingStream: MediaStream | undefined
      try {
        primingStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        const devices = await enumerateWithRetry(
          primingStream.getVideoTracks().length > 0,
          primingStream.getAudioTracks().length > 0
        )
        primingStream.getTracks().forEach((track) => track.stop())
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
        // Cobre tanto falha de getUserMedia quanto de enumerateDevices - nesse ultimo caso a
        // stream pode ter sido concedida e precisa ser encerrada mesmo assim.
        primingStream?.getTracks().forEach((track) => track.stop())
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
