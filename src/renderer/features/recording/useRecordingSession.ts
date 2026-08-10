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

interface TrackRecorderState {
  recorder: MediaRecorder
  sequence: number
  sendQueue: Promise<void>
}

/**
 * RF-002/RF-006/RF-007/RF-009/RF-011/RF-014/RF-016 (quarto incremento - microfone + camera +
 * tela simultaneos, ver README "Decisoes de arquitetura"). Um `MediaRecorder` por fonte ativa,
 * cada um com seu proprio `trackId` (devolvido por `recording.start`) e sua propria fila serial
 * de envio - a ordem só precisa ser garantida DENTRO de cada trilha (cada uma vira um arquivo
 * separado). A stream de tela e adquirida SOB DEMANDA aqui, so ao iniciar a gravacao - nao ha
 * preview de tela ao vivo (decisao registrada, ver README), diferente de microfone/camera que ja
 * chegam como streams continuas de preview escolhidas em `RecordingSetupPage`.
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
  const startedAtRef = useRef(0)
  const elapsedIntervalRef = useRef<number | null>(null)

  const start = useCallback(
    async (title: string) => {
      const trackTypes: RecordingTrackType[] = []
      if (sources.microphone) trackTypes.push('MICROPHONE')
      if (sources.camera) trackTypes.push('CAMERA')
      if (sources.screenSourceId) trackTypes.push('SCREEN')

      if (trackTypes.length === 0) {
        setState((prev) => ({
          ...prev,
          error: 'Selecione ao menos uma fonte (tela, camera ou microfone) antes de gravar.'
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
          }
          if (!stream) continue

          const mimeType = pickSupportedMimeType(handle.type === 'MICROPHONE' ? 'audio' : 'video')
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
    [sources.microphone, sources.camera, sources.screenSourceId]
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
