import { useCallback, useRef, useState } from 'react'

export type RecordingSessionStatus = 'idle' | 'starting' | 'recording' | 'stopping'

export interface RecordingSessionState {
  status: RecordingSessionStatus
  elapsedMs: number
  error: string | null
}

const CHUNK_TIMESLICE_MS = 1000
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm']

function pickSupportedMimeType(): string {
  for (const candidate of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

/**
 * RF-009/RF-011/RF-014/RF-016 (primeiro incremento - somente microfone). Envia cada chunk do
 * `MediaRecorder` ao main assim que ele chega (nunca acumula a gravacao inteira em memoria no
 * renderer - RF-014), em fila estritamente serial (`sendQueueRef`) para garantir que os chunks
 * cheguem na ordem correta mesmo que o IPC de um chunk demore mais que o proximo ser gerado.
 */
export function useRecordingSession(micStream: MediaStream | null) {
  const [state, setState] = useState<RecordingSessionState>({
    status: 'idle',
    elapsedMs: 0,
    error: null
  })

  const recorderRef = useRef<MediaRecorder | null>(null)
  const projectIdRef = useRef<string | null>(null)
  const trackIdRef = useRef<string | null>(null)
  const sequenceRef = useRef(0)
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve())
  const startedAtRef = useRef(0)
  const elapsedIntervalRef = useRef<number | null>(null)

  const start = useCallback(
    async (title: string) => {
      if (!micStream) {
        setState((prev) => ({ ...prev, error: 'Selecione um microfone antes de gravar.' }))
        return
      }

      setState({ status: 'starting', elapsedMs: 0, error: null })

      try {
        const project = await window.meetingStudio.project.create({ title })
        const { microphoneTrackId } = await window.meetingStudio.recording.start({
          projectId: project.id
        })

        projectIdRef.current = project.id
        trackIdRef.current = microphoneTrackId
        sequenceRef.current = 0
        sendQueueRef.current = Promise.resolve()

        const mimeType = pickSupportedMimeType()
        const recorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined)

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size === 0 || !trackIdRef.current) return
          const sequence = sequenceRef.current
          sequenceRef.current += 1
          const trackId = trackIdRef.current
          const chunkMimeType = recorder.mimeType

          sendQueueRef.current = sendQueueRef.current
            .then(async () => {
              const buffer = await event.data.arrayBuffer()
              await window.meetingStudio.recording.appendChunk({
                trackId,
                sequence,
                mimeType: chunkMimeType,
                data: new Uint8Array(buffer)
              })
            })
            .catch((error: unknown) => {
              // Falha ao persistir UM chunk nao deve interromper a gravacao em andamento - o
              // usuario ainda pode parar normalmente; o segmento refletira os chunks recebidos.
              console.error('Falha ao enviar chunk de gravacao', error)
            })
        }

        recorderRef.current = recorder
        recorder.start(CHUNK_TIMESLICE_MS)
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
    [micStream]
  )

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    const projectId = projectIdRef.current
    if (!recorder || !projectId) return

    setState((prev) => ({ ...prev, status: 'stopping' }))

    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current)
      elapsedIntervalRef.current = null
    }

    await new Promise<void>((resolveStop) => {
      recorder.addEventListener('stop', () => resolveStop(), { once: true })
      recorder.stop()
    })

    // Espera todos os chunks pendentes serem enviados antes de pedir a finalizacao no main.
    await sendQueueRef.current

    try {
      await window.meetingStudio.recording.stop({ projectId })
      setState({ status: 'idle', elapsedMs: 0, error: null })
    } catch (error) {
      console.error('Falha ao finalizar gravacao', error)
      setState({ status: 'idle', elapsedMs: 0, error: 'Falha ao finalizar a gravacao.' })
    } finally {
      recorderRef.current = null
      projectIdRef.current = null
      trackIdRef.current = null
    }
  }, [])

  return { ...state, start, stop }
}
