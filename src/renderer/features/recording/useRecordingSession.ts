import { useCallback, useRef, useState } from 'react'
import type { RecordingTrackType } from '@shared/schemas/recording.schema'

export type RecordingSessionStatus = 'idle' | 'starting' | 'recording' | 'stopping'

export interface RecordingSessionState {
  status: RecordingSessionStatus
  elapsedMs: number
  error: string | null
}

export interface RecordingSources {
  microphone: MediaStream | null
  camera: MediaStream | null
  /** RF-002 - `id` de `devices.listScreens` (`screen:ZZ:0`/`window:XX:YY`), nao uma stream. */
  screenSourceId: string | null
  /**
   * RF-005 - `id` (tipo `kind: 'screen'`, nunca `'window'`) usado como "portador" da captura de
   * audio do sistema - null quando o usuario nao marcou o checkbox OU quando nenhuma fonte do
   * tipo tela esta disponivel para servir de portador (ver `acquireSystemAudioStream`). NAO e
   * necessariamente o mesmo `id` de `screenSourceId` (o usuario pode gravar audio do sistema sem
   * gravar a tela como video, ou vice-versa) - o video dessa captura e sempre descartado.
   */
  systemAudioCarrierSourceId: string | null
}

const CHUNK_TIMESLICE_MS = 1000

function pickSupportedMimeType(kind: 'audio' | 'video'): string {
  const candidates =
    kind === 'audio' ? ['audio/webm;codecs=opus', 'audio/webm'] : ['video/webm;codecs=vp8', 'video/webm']
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

/**
 * `mandatory`/`chromeMediaSource` sao extensoes nao-padrao do Chromium para `getUserMedia`,
 * usadas para capturar uma fonte especifica do `desktopCapturer` (main, via `devices.listScreens`)
 * - nao existem nos tipos DOM padrao do TypeScript, por isso a interface propria + cast.
 */
interface DesktopCaptureConstraints {
  audio: false
  video: {
    mandatory: {
      chromeMediaSource: 'desktop'
      chromeMediaSourceId: string
    }
  }
}

async function acquireScreenStream(sourceId: string): Promise<MediaStream> {
  const constraints: DesktopCaptureConstraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
      }
    }
  }
  return navigator.mediaDevices.getUserMedia(constraints as unknown as MediaStreamConstraints)
}

/**
 * RF-005 - audio de saida (loopback) de todo o sistema. Achado empirico registrado durante este
 * incremento: pedir SO audio (`video: false`) com `chromeMediaSource: 'desktop'` faz o Chromium
 * (testado no Electron 43) CRASHAR o processo de renderer, nao apenas rejeitar a Promise -
 * confirmado via teste E2E ("Page crashed" no Playwright). A API exige uma captura de video
 * (`chromeMediaSourceId` de uma fonte `kind: 'screen'` - `window` nao suporta audio loopback)
 * emparelhada, mesmo que o video nao seja usado; por isso pedimos os dois e descartamos
 * imediatamente as tracks de video, mantendo so o audio. "Quando suportado pela plataforma"
 * (RF-005) continua valendo para o restante: a Promise ainda pode rejeitar (sem crash) se nao
 * houver fonte de tela disponivel ou o loopback nao for suportado, e quem chama trata isso como
 * falha recuperavel (ver `start()` abaixo), nao como erro fatal da gravacao inteira.
 */
interface SystemAudioCaptureConstraints {
  audio: {
    mandatory: {
      chromeMediaSource: 'desktop'
    }
  }
  video: {
    mandatory: {
      chromeMediaSource: 'desktop'
      chromeMediaSourceId: string
    }
  }
}

async function acquireSystemAudioStream(carrierSourceId: string): Promise<MediaStream> {
  const constraints: SystemAudioCaptureConstraints = {
    audio: { mandatory: { chromeMediaSource: 'desktop' } },
    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: carrierSourceId } }
  }
  const combined = await navigator.mediaDevices.getUserMedia(
    constraints as unknown as MediaStreamConstraints
  )
  combined.getVideoTracks().forEach((track) => track.stop())
  return new MediaStream(combined.getAudioTracks())
}

interface TrackRecorderState {
  recorder: MediaRecorder
  sequence: number
  sendQueue: Promise<void>
}

/**
 * RF-002/RF-005/RF-006/RF-007/RF-009/RF-011/RF-014/RF-016 (quinto incremento - microfone +
 * camera + tela + audio do sistema simultaneos, ver README "Decisoes de arquitetura"). Um
 * `MediaRecorder` por fonte ativa, cada um com seu proprio `trackId` (devolvido por
 * `recording.start`) e sua propria fila serial de envio - a ordem só precisa ser garantida DENTRO
 * de cada trilha (cada uma vira um arquivo separado). As streams de tela e audio do sistema sao
 * adquiridas SOB DEMANDA aqui, so ao iniciar a gravacao - nao ha preview ao vivo de nenhuma das
 * duas (decisao registrada, ver README), diferente de microfone/camera que ja chegam como streams
 * continuas de preview escolhidas em `RecordingSetupPage`. Audio do sistema, alem disso, degrada
 * graciosamente (RF-005): se a plataforma nao suportar, so essa trilha fica de fora, a gravacao
 * das demais fontes continua normalmente.
 */
export function useRecordingSession(sources: RecordingSources) {
  const [state, setState] = useState<RecordingSessionState>({
    status: 'idle',
    elapsedMs: 0,
    error: null
  })

  const projectIdRef = useRef<string | null>(null)
  const trackRecordersRef = useRef<Map<string, TrackRecorderState>>(new Map())
  const screenStreamRef = useRef<MediaStream | null>(null)
  const systemAudioStreamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const elapsedIntervalRef = useRef<number | null>(null)

  const start = useCallback(
    async (title: string) => {
      const trackTypes: RecordingTrackType[] = []
      if (sources.microphone) trackTypes.push('MICROPHONE')
      if (sources.camera) trackTypes.push('CAMERA')
      if (sources.screenSourceId) trackTypes.push('SCREEN')
      if (sources.systemAudioCarrierSourceId) trackTypes.push('SYSTEM_AUDIO')

      if (trackTypes.length === 0) {
        setState((prev) => ({
          ...prev,
          error: 'Selecione ao menos uma fonte (tela, camera, microfone ou audio do sistema) antes de gravar.'
        }))
        return
      }

      setState({ status: 'starting', elapsedMs: 0, error: null })

      let projectId: string | null = null
      try {
        const project = await window.meetingStudio.project.create({ title })
        projectId = project.id
        const { tracks } = await window.meetingStudio.recording.start({
          projectId: project.id,
          trackTypes
        })

        projectIdRef.current = project.id
        trackRecordersRef.current.clear()

        for (const handle of tracks) {
          let stream: MediaStream | null = null
          if (handle.type === 'MICROPHONE') {
            stream = sources.microphone
          } else if (handle.type === 'CAMERA') {
            stream = sources.camera
          } else if (handle.type === 'SCREEN' && sources.screenSourceId) {
            stream = await acquireScreenStream(sources.screenSourceId)
            screenStreamRef.current = stream
          } else if (handle.type === 'SYSTEM_AUDIO' && sources.systemAudioCarrierSourceId) {
            // RF-005: "quando suportado pela plataforma" - diferente das demais fontes, uma falha
            // aqui NAO aborta a gravacao inteira (nao propaga para o catch externo) - so pula essa
            // trilha especifica. O main ja registrou a trilha em `recording.start`; se nenhum
            // chunk chegar, `RecordingSessionManager.stop()` a finaliza sem segmento (ver
            // comentario em `TRACK_TYPE_INFO`).
            try {
              stream = await acquireSystemAudioStream(sources.systemAudioCarrierSourceId)
              systemAudioStreamRef.current = stream
            } catch (systemAudioError) {
              console.error(
                'Audio do sistema indisponivel nesta plataforma (RF-005) - gravacao continua sem essa trilha',
                systemAudioError
              )
              stream = null
            }
          }
          if (!stream) continue

          const mimeType = pickSupportedMimeType(
            handle.type === 'MICROPHONE' || handle.type === 'SYSTEM_AUDIO' ? 'audio' : 'video'
          )
          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
          const trackState: TrackRecorderState = {
            recorder,
            sequence: 0,
            sendQueue: Promise.resolve()
          }
          trackRecordersRef.current.set(handle.trackId, trackState)

          recorder.ondataavailable = (event: BlobEvent) => {
            if (event.data.size === 0) return
            const sequence = trackState.sequence
            trackState.sequence += 1
            const chunkMimeType = recorder.mimeType

            trackState.sendQueue = trackState.sendQueue
              .then(async () => {
                const buffer = await event.data.arrayBuffer()
                await window.meetingStudio.recording.appendChunk({
                  trackId: handle.trackId,
                  sequence,
                  mimeType: chunkMimeType,
                  data: new Uint8Array(buffer)
                })
              })
              .catch((error: unknown) => {
                // Falha ao persistir UM chunk nao deve interromper a gravacao em andamento.
                console.error('Falha ao enviar chunk de gravacao', error)
              })
          }

          recorder.start(CHUNK_TIMESLICE_MS)
        }

        startedAtRef.current = Date.now()
        elapsedIntervalRef.current = window.setInterval(() => {
          setState((prev) => ({ ...prev, elapsedMs: Date.now() - startedAtRef.current }))
        }, 250)

        setState({ status: 'recording', elapsedMs: 0, error: null })
      } catch (error) {
        console.error('Falha ao iniciar gravacao', error)
        screenStreamRef.current?.getTracks().forEach((track) => track.stop())
        screenStreamRef.current = null
        systemAudioStreamRef.current?.getTracks().forEach((track) => track.stop())
        systemAudioStreamRef.current = null
        trackRecordersRef.current.clear()
        // O main pode ja ter criado uma sessao ativa (recording.start ja retornou com sucesso)
        // mesmo que a configuracao local seguinte (ex.: acquireScreenStream) tenha falhado depois
        // - libera no main tambem, senao a sessao fica "fantasma" presa la (AGENTS.md:
        // confiabilidade - nunca deixar o sistema sem possibilidade de nova tentativa).
        if (projectId) {
          await window.meetingStudio.recording.stop({ projectId }).catch(() => {})
        }
        projectIdRef.current = null
        setState({
          status: 'idle',
          elapsedMs: 0,
          error: 'Nao foi possivel iniciar a gravacao. Tente novamente.'
        })
      }
    },
    [
      sources.microphone,
      sources.camera,
      sources.screenSourceId,
      sources.systemAudioCarrierSourceId
    ]
  )

  const stop = useCallback(async () => {
    const projectId = projectIdRef.current
    const trackRecorders = trackRecordersRef.current
    if (!projectId || trackRecorders.size === 0) return

    setState((prev) => ({ ...prev, status: 'stopping' }))

    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current)
      elapsedIntervalRef.current = null
    }

    await Promise.all(
      Array.from(trackRecorders.values()).map(
        (trackState) =>
          new Promise<void>((resolveStop) => {
            trackState.recorder.addEventListener('stop', () => resolveStop(), { once: true })
            trackState.recorder.stop()
          })
      )
    )

    // Espera todos os chunks pendentes de TODAS as trilhas serem enviados antes de finalizar.
    await Promise.all(Array.from(trackRecorders.values()).map((trackState) => trackState.sendQueue))

    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    systemAudioStreamRef.current?.getTracks().forEach((track) => track.stop())
    systemAudioStreamRef.current = null

    try {
      await window.meetingStudio.recording.stop({ projectId })
      setState({ status: 'idle', elapsedMs: 0, error: null })
    } catch (error) {
      console.error('Falha ao finalizar gravacao', error)
      setState({ status: 'idle', elapsedMs: 0, error: 'Falha ao finalizar a gravacao.' })
    } finally {
      trackRecorders.clear()
      projectIdRef.current = null
    }
  }, [])

  return { ...state, start, stop }
}
