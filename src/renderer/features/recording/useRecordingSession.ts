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

interface TrackRecorderState {
  recorder: MediaRecorder
  sequence: number
  sendQueue: Promise<void>
}

/**
 * RF-006/RF-007/RF-009/RF-011/RF-014/RF-016 (terceiro incremento - microfone + camera
 * simultaneos, ver README "Decisoes de arquitetura"). Um `MediaRecorder` por fonte ativa, cada
 * um com seu proprio `trackId` (devolvido por `recording.start`) e sua propria fila serial de
 * envio - a ordem só precisa ser garantida DENTRO de cada trilha (cada uma vira um arquivo
 * separado), nao entre trilhas diferentes.
 */
export function useRecordingSession(sources: RecordingSources) {
  const [state, setState] = useState<RecordingSessionState>({
    status: 'idle',
    elapsedMs: 0,
    error: null
  })

  const projectIdRef = useRef<string | null>(null)
  const trackRecordersRef = useRef<Map<string, TrackRecorderState>>(new Map())
  const startedAtRef = useRef(0)
  const elapsedIntervalRef = useRef<number | null>(null)

  const start = useCallback(
    async (title: string) => {
      const trackTypes: RecordingTrackType[] = []
      if (sources.microphone) trackTypes.push('MICROPHONE')
      if (sources.camera) trackTypes.push('CAMERA')

      if (trackTypes.length === 0) {
        setState((prev) => ({
          ...prev,
          error: 'Selecione ao menos uma fonte (microfone ou camera) antes de gravar.'
        }))
        return
      }

      setState({ status: 'starting', elapsedMs: 0, error: null })

      try {
        const project = await window.meetingStudio.project.create({ title })
        const { tracks } = await window.meetingStudio.recording.start({
          projectId: project.id,
          trackTypes
        })

        projectIdRef.current = project.id
        trackRecordersRef.current.clear()

        for (const handle of tracks) {
          const stream = handle.type === 'MICROPHONE' ? sources.microphone : sources.camera
          if (!stream) continue

          const mimeType = pickSupportedMimeType(handle.type === 'MICROPHONE' ? 'audio' : 'video')
          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
          const trackState: TrackRecorderState = { recorder, sequence: 0, sendQueue: Promise.resolve() }
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
        setState({
          status: 'idle',
          elapsedMs: 0,
          error: 'Nao foi possivel iniciar a gravacao. Tente novamente.'
        })
      }
    },
    [sources.microphone, sources.camera]
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
