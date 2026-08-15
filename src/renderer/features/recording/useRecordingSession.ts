import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecordingTrackType } from '@shared/schemas/recording.schema'
import type { MarkerResponse } from '@shared/schemas/markers.schema'
import { RecordingPresetsSettingsSchema } from '@shared/schemas/settings.schema'
import { getFriendlyErrorMessage } from '@shared/constants/error-messages'
import { shouldRotateForSize } from './segmentation-thresholds'
import { classifyDiskSpace, type DiskSpaceStatus } from './disk-space-thresholds'

export type RecordingSessionStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping'

export interface RecordingSessionState {
  status: RecordingSessionStatus
  elapsedMs: number
  error: string | null
  /** RF-016 (oitavo incremento - marcadores) - acumulados em memoria durante a sessao ativa. */
  markers: MarkerResponse[]
  /**
   * RF-042 (nono incremento - monitor de espaco em disco). `null` fora de uma sessao ativa (ainda
   * nao verificado / sessao encerrada). Ver `disk-space-thresholds.ts`.
   */
  diskSpaceStatus: DiskSpaceStatus | null
  freeDiskBytes: number | null
}

/**
 * RF-042 - intervalo do polling continuo de espaco em disco durante uma sessao ativa (gravando OU
 * pausada - o monitor nao pausa junto com o cronometro, o espaco em disco pode cair por qualquer
 * motivo enquanto a sessao segue aberta). 5s equilibra responsividade (o nivel critico dispara um
 * stop automatico) contra custo de IPC - nao precisa ser tao fino quanto o timeslice de chunk
 * (1s).
 */
const DISK_SPACE_POLL_INTERVAL_MS = 5000

/**
 * Extrai o codigo de erro de dominio de um erro IPC (`IpcError` em `preload/invoke.ts`) - faz o
 * parse do prefixo `[CODE]` no INICIO de `.message`, nao le `.name`/`.code` diretamente. Achado
 * empirico (dois testes E2E instrumentados durante este incremento, ver comentario em `IpcError`):
 * o `contextBridge` do Electron, ao propagar uma excecao lancada no preload ate o mundo isolado do
 * renderer, preserva SO `.message` - nem `.name` (sempre chega como o generico `'Error'`, mesmo
 * apos `IpcError` seta-lo explicitamente no preload) nem propriedades customizadas (`.code`/
 * `.metadata`) sobrevivem ao clone. `.message`, por ser o UNICO campo confirmado a sobreviver, e
 * onde `IpcError` codifica o `code` (prefixo `[CODE] `) para o renderer conseguir recupera-lo.
 * Usado para trocar a mensagem generica de falha por uma mensagem amigavel especifica
 * (`getFriendlyErrorMessage`, ja definida desde a Fase 0 mas nunca consumida pelo renderer ate este
 * incremento) quando o main rejeita `recording.start` por um motivo conhecido (ex.: `DISK_SPACE_ERROR`).
 */
function extractIpcErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const match = /^\[([A-Z_]+)\]/.exec((error as { message: string }).message)
    return match?.[1]
  }
  return undefined
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
  stream: MediaStream
  mimeType: string
  segmentIndex: number
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
 *
 * RF-012/RF-013 (sexto incremento - segmentacao por tempo/tamanho): um WebM/Matroska so e valido
 * se produzido por um ciclo completo `MediaRecorder.start()`...`.stop()` - nao da para so continuar
 * escrevendo bytes num arquivo novo no meio do stream. Rotacionar um segmento significa: parar o
 * `MediaRecorder` atual da trilha, esperar seu ultimo chunk ser enviado, e iniciar um NOVO
 * `MediaRecorder` sobre a MESMA `MediaStream` (parar um recorder nao para as tracks do stream) -
 * `createTrackRecorderState` e reaproveitada tanto na criacao inicial quanto em cada rotacao,
 * sempre capturando o `segmentIndex` daquele recorder especifico de forma IMUTAVEL no closure
 * (nunca lido de uma ref mutavel compartilhada - senao o ultimo chunk do segmento antigo poderia
 * ser marcado com o indice do novo, ja trocado antes do `ondataavailable` final disparar).
 *
 * As funcoes de rotacao abaixo se referenciam mutuamente (`createTrackRecorderState` agenda uma
 * futura chamada a `rotateTrack`, que chama `createTrackRecorderState` de volta para o proximo
 * segmento) - `rotateTrackRef` quebra esse ciclo (padrao "latest ref" do React): as outras
 * funcoes chamam `rotateTrackRef.current(trackId)` em vez de referenciar `rotateTrack` pelo nome
 * diretamente, entao `withTrackLock`/`scheduleTimeRotation`/`createTrackRecorderState` continuam
 * memoizaveis com deps estaveis (nunca mudam de identidade entre renders), o que por sua vez
 * mantem `rotateTrack` E `start` tambem estaveis - sem isso, `react-hooks/exhaustive-deps` fica
 * preso entre "falta dependencia" e "essa dependencia muda a cada render", ja que as funcoes
 * formam um ciclo.
 */
export function useRecordingSession(sources: RecordingSources) {
  const [state, setState] = useState<RecordingSessionState>({
    status: 'idle',
    elapsedMs: 0,
    error: null,
    markers: [],
    diskSpaceStatus: null,
    freeDiskBytes: null
  })

  const projectIdRef = useRef<string | null>(null)
  const trackRecordersRef = useRef<Map<string, TrackRecorderState>>(new Map())
  const screenStreamRef = useRef<MediaStream | null>(null)
  const systemAudioStreamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const elapsedIntervalRef = useRef<number | null>(null)

  // Segmentacao (RF-012/RF-013): limites globais lidos uma vez de Configuracoes a cada
  // `recording.start` (refs, nao state - lidos de dentro de timers/callbacks assincronos que nao
  // devem re-executar a cada render). `stoppedRef` e checado de forma SINCRONA (antes de qualquer
  // `await`) no inicio de `rotateTrack` e no inicio de `stop()`, fechando a mesma janela de
  // corrida corrigida no lado main (`RecordingSessionManager.stop`/`track.stopped`).
  const timeSegmentationMinutesRef = useRef<number | null>(null)
  const sizeSegmentationMbRef = useRef<number | null>(null)
  const stoppedRef = useRef(false)
  const trackLocksRef = useRef<Map<string, Promise<void>>>(new Map())
  const rotationTimersRef = useRef<Map<string, number>>(new Map())
  const rotateTrackRef = useRef<(trackId: string) => Promise<void>>(async () => {})
  // `MediaRecorder.stop()` emite um ultimo `ondataavailable` de flush ANTES do evento `'stop'` -
  // esse chunk final ainda pertence ao segmento antigo (mesmo `segmentIndex` do closure) mas seu
  // `totalBytes` continua acima do limite (bytes so crescem), entao SEM esta guarda ele dispara
  // uma SEGUNDA rotacao redundante - que roda em fila logo apos a primeira (via `withTrackLock`) e
  // apaga o segmento recem-criado quase instantaneamente, pulando direto para o proximo indice
  // (achado via log de diagnostico: `..._000002.webm` nunca era criado, a rotacao ia direto pra
  // `..._000003.webm`). A guarda impede enfileirar uma nova rotacao enquanto uma ja esta em
  // andamento para a trilha - marcada no ponto de disparo (sincrono, antes de `withTrackLock`),
  // nao dentro de `rotateTrack` (que so roda DEPOIS que a fila do `withTrackLock` chega nele - por
  // essa altura uma rotacao anterior ja teria terminado e liberado a marca, entao a checagem
  // precisa acontecer ANTES de enfileirar, nao dentro do que foi enfileirado).
  const rotationInFlightRef = useRef<Set<string>>(new Set())

  // RF-010 (setimo incremento - pausar/retomar). `MediaRecorder.pause()`/`.resume()` sao APIs
  // nativas que suspendem/retomam a MESMA gravacao - sem novo segmento, sem parar/reiniciar o
  // recorder (diferente da rotacao). `totalPausedMsRef` acumula a duracao de TODAS as pausas da
  // sessao, subtraida no calculo de `elapsedMs` (senao o cronometro pularia pra frente ao
  // retomar, contando o tempo pausado como se tivesse gravado). `rotationTimerStartedAtRef`/
  // `rotationTimerRemainingMsRef` existem para que a segmentacao por TEMPO conte duracao
  // GRAVADA, nao tempo de parede - pausar e retomar sem isso faria o timer de rotacao continuar
  // contando durante a pausa (rotacionando cedo demais) ou, se so reiniciado do zero ao retomar,
  // faria o segmento crescer ate quase o DOBRO do limite configurado a cada pausa.
  const pausedAtRef = useRef<number | null>(null)
  const totalPausedMsRef = useRef(0)
  const rotationTimerStartedAtRef = useRef<Map<string, number>>(new Map())
  const rotationTimerRemainingMsRef = useRef<Map<string, number>>(new Map())

  // RF-042 (nono incremento - monitor de espaco em disco). `pollDiskSpaceRef` quebra o mesmo tipo
  // de ciclo de dependencias que `rotateTrackRef` ja resolve acima: o timer iniciado dentro de
  // `start()` precisa chamar a versao mais recente de `pollDiskSpace` (definida so depois de
  // `stop`, que ela propria chama no nivel critico) sem forcar `start` a depender de `stop`
  // diretamente. `autoStopReasonRef` carrega a mensagem amigavel do stop AUTOMATICO (disco cheio)
  // para dentro de `stop()`, que por padrao (stop manual, pelo usuario) sempre limpa `error` para
  // `null` - sem isso o motivo do stop automatico se perderia.
  const diskSpaceIntervalRef = useRef<number | null>(null)
  const pollDiskSpaceRef = useRef<() => Promise<void>>(async () => {})
  const autoStopReasonRef = useRef<string | null>(null)

  const withTrackLock = useCallback((trackId: string, fn: () => Promise<void>): Promise<void> => {
    const prior = trackLocksRef.current.get(trackId) ?? Promise.resolve()
    const next = prior.then(fn, fn)
    trackLocksRef.current.set(
      trackId,
      next.catch(() => {})
    )
    return next
  }, [])

  // Marca a trilha como "rotacao em andamento" ANTES de enfileirar (nao dentro de `rotateTrack` -
  // ver comentario em `rotationInFlightRef`) - ponto unico usado tanto pelo gatilho por tamanho
  // quanto pelo gatilho por tempo, evitando duplicar a guarda em cada um.
  const requestRotation = useCallback(
    (trackId: string): void => {
      if (rotationInFlightRef.current.has(trackId)) return
      rotationInFlightRef.current.add(trackId)
      void withTrackLock(trackId, () => rotateTrackRef.current(trackId))
    },
    [withTrackLock]
  )

  // `overrideDurationMs` e usado so por `resume()`, pra retomar o timer com o tempo RESTANTE (nao
  // reiniciar do zero) - ver comentario em `rotationTimerRemainingMsRef`. Sem argumento, agenda a
  // duracao cheia configurada (caminho normal: inicio da gravacao ou apos uma rotacao).
  const scheduleTimeRotation = useCallback(
    (trackId: string, overrideDurationMs?: number): void => {
      const existing = rotationTimersRef.current.get(trackId)
      if (existing !== undefined) window.clearTimeout(existing)
      const minutes = timeSegmentationMinutesRef.current
      const durationMs = overrideDurationMs ?? (minutes === null ? null : minutes * 60_000)
      if (durationMs === null) return
      rotationTimerStartedAtRef.current.set(trackId, Date.now())
      const timerId = window.setTimeout(() => {
        requestRotation(trackId)
      }, durationMs)
      rotationTimersRef.current.set(trackId, timerId)
    },
    [requestRotation]
  )

  const createTrackRecorderState = useCallback(
    (trackId: string, stream: MediaStream, mimeType: string, segmentIndex: number): TrackRecorderState => {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const trackState: TrackRecorderState = {
        recorder,
        stream,
        mimeType,
        segmentIndex,
        sequence: 0,
        sendQueue: Promise.resolve()
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size === 0) return
        const sequence = trackState.sequence
        trackState.sequence += 1
        const chunkMimeType = recorder.mimeType

        trackState.sendQueue = trackState.sendQueue
          .then(async () => {
            const buffer = await event.data.arrayBuffer()
            const response = await window.meetingStudio.recording.appendChunk({
              trackId,
              segmentIndex,
              sequence,
              mimeType: chunkMimeType,
              data: new Uint8Array(buffer)
            })
            if (shouldRotateForSize(response.totalBytes, sizeSegmentationMbRef.current)) {
              // Fora da propria `sendQueue` (nao aninhado num `await`) - `rotateTrack` precisa
              // esperar essa MESMA fila esvaziar antes de trocar de recorder; aninhar travaria (a
              // fila nunca terminaria de esperar por ela mesma). `requestRotation` ja tem a guarda
              // contra o chunk final de flush do `.stop()` disparar uma segunda rotacao redundante
              // (ver comentario em `rotationInFlightRef`).
              requestRotation(trackId)
            }
          })
          .catch((error: unknown) => {
            // Falha ao persistir UM chunk nao deve interromper a gravacao em andamento.
            console.error('Falha ao enviar chunk de gravacao', error)
          })
      }

      return trackState
    },
    [requestRotation]
  )

  const rotateTrack = useCallback(
    async (trackId: string): Promise<void> => {
      // `rotationInFlightRef` foi marcada em `requestRotation`, ANTES desta funcao ser enfileirada
      // - sempre limpar aqui (mesmo em early-return) para permitir a PROXIMA rotacao genuina
      // (quando o novo segmento tambem crescer alem do limite).
      try {
        if (stoppedRef.current) return
        const current = trackRecordersRef.current.get(trackId)
        if (!current) return

        await new Promise<void>((resolveStop) => {
          current.recorder.addEventListener('stop', () => resolveStop(), { once: true })
          current.recorder.stop()
        })
        await current.sendQueue

        if (stoppedRef.current) return

        const next = createTrackRecorderState(
          trackId,
          current.stream,
          current.mimeType,
          current.segmentIndex + 1
        )
        trackRecordersRef.current.set(trackId, next)
        next.recorder.start(CHUNK_TIMESLICE_MS)
        scheduleTimeRotation(trackId)
      } finally {
        rotationInFlightRef.current.delete(trackId)
      }
    },
    [createTrackRecorderState, scheduleTimeRotation]
  )

  // Mantem `rotateTrackRef` sempre apontando para a versao mais recente de `rotateTrack` (que,
  // nesta implementacao, e estavel entre renders ja que suas proprias deps tambem sao - mas o
  // ref e o que realmente quebra o ciclo de dependencias, entao mante-lo atualizado aqui e o que
  // torna essa premissa segura mesmo que uma dependencia deixe de ser estavel no futuro).
  useEffect(() => {
    rotateTrackRef.current = rotateTrack
  }, [rotateTrack])

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

      setState({
        status: 'starting',
        elapsedMs: 0,
        error: null,
        markers: [],
        diskSpaceStatus: null,
        freeDiskBytes: null
      })
      stoppedRef.current = false

      let projectId: string | null = null
      try {
        const presets = RecordingPresetsSettingsSchema.parse(
          await window.meetingStudio.settings.get('recordingPresets')
        )
        timeSegmentationMinutesRef.current = presets.timeSegmentationMinutes
        sizeSegmentationMbRef.current = presets.sizeSegmentationMb
        rotationInFlightRef.current.clear()
        pausedAtRef.current = null
        totalPausedMsRef.current = 0
        rotationTimerStartedAtRef.current.clear()
        rotationTimerRemainingMsRef.current.clear()
        autoStopReasonRef.current = null

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
          const trackState = createTrackRecorderState(handle.trackId, stream, mimeType, 1)
          trackRecordersRef.current.set(handle.trackId, trackState)
          trackState.recorder.start(CHUNK_TIMESLICE_MS)
          scheduleTimeRotation(handle.trackId)
        }

        startedAtRef.current = Date.now()
        elapsedIntervalRef.current = window.setInterval(() => {
          setState((prev) => ({
            ...prev,
            elapsedMs: Date.now() - startedAtRef.current - totalPausedMsRef.current
          }))
        }, 250)

        // RF-042: primeira leitura imediata (nao esperar o primeiro tick do intervalo) para o
        // espaco em disco ja aparecer assim que a gravacao comeca, nao alguns segundos depois.
        diskSpaceIntervalRef.current = window.setInterval(() => {
          void pollDiskSpaceRef.current()
        }, DISK_SPACE_POLL_INTERVAL_MS)
        void pollDiskSpaceRef.current()

        setState({
          status: 'recording',
          elapsedMs: 0,
          error: null,
          markers: [],
          diskSpaceStatus: null,
          freeDiskBytes: null
        })
      } catch (error) {
        console.error('Falha ao iniciar gravacao', error)
        screenStreamRef.current?.getTracks().forEach((track) => track.stop())
        screenStreamRef.current = null
        systemAudioStreamRef.current?.getTracks().forEach((track) => track.stop())
        systemAudioStreamRef.current = null
        for (const timerId of rotationTimersRef.current.values()) window.clearTimeout(timerId)
        rotationTimersRef.current.clear()
        rotationTimerStartedAtRef.current.clear()
        rotationTimerRemainingMsRef.current.clear()
        if (diskSpaceIntervalRef.current !== null) {
          window.clearInterval(diskSpaceIntervalRef.current)
          diskSpaceIntervalRef.current = null
        }
        trackLocksRef.current.clear()
        rotationInFlightRef.current.clear()
        trackRecordersRef.current.clear()
        // O main pode ja ter criado uma sessao ativa (recording.start ja retornou com sucesso)
        // mesmo que a configuracao local seguinte (ex.: acquireScreenStream) tenha falhado depois
        // - libera no main tambem, senao a sessao fica "fantasma" presa la (AGENTS.md:
        // confiabilidade - nunca deixar o sistema sem possibilidade de nova tentativa).
        if (projectId) {
          await window.meetingStudio.recording.stop({ projectId }).catch(() => {})
        }
        projectIdRef.current = null
        // RF-042: quando o main rejeita `recording.start` por um motivo conhecido (ex.: espaco em
        // disco abaixo da margem minima - `DISK_SPACE_ERROR`), mostra a mensagem amigavel especifica
        // (`getFriendlyErrorMessage`) em vez do fallback generico.
        const errorCode = extractIpcErrorCode(error)
        setState({
          status: 'idle',
          elapsedMs: 0,
          error: errorCode
            ? getFriendlyErrorMessage(errorCode)
            : 'Nao foi possivel iniciar a gravacao. Tente novamente.',
          markers: [],
          diskSpaceStatus: null,
          freeDiskBytes: null
        })
      }
    },
    [
      sources.microphone,
      sources.camera,
      sources.screenSourceId,
      sources.systemAudioCarrierSourceId,
      // Ambas memoizadas com deps estaveis (ver comentario no topo do arquivo sobre `rotateTrackRef`
      // quebrando o ciclo) - incluir aqui satisfaz `exhaustive-deps` sem fazer `start` mudar de
      // identidade a cada render.
      createTrackRecorderState,
      scheduleTimeRotation
    ]
  )

  /**
   * RF-010 - pausa a sessao inteira (todas as trilhas juntas, nao por trilha - diferente da
   * rotacao). Chama o main PRIMEIRO: se `recording.pause` for rejeitado (ex.: estado invalido -
   * ja pausado, nao esta gravando), nada local e tocado, sem necessidade de desfazer nada.
   */
  const pause = useCallback(async () => {
    const projectId = projectIdRef.current
    if (!projectId || trackRecordersRef.current.size === 0) return

    try {
      await window.meetingStudio.recording.pause({ projectId })
    } catch (error) {
      console.error('Falha ao pausar gravacao', error)
      setState((prev) => ({ ...prev, error: 'Falha ao pausar a gravacao.' }))
      return
    }

    pausedAtRef.current = Date.now()

    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current)
      elapsedIntervalRef.current = null
    }

    // Guarda quanto tempo RESTAVA em cada timer de rotacao por tempo antes de zera-los - `resume`
    // reagenda com esse restante, nao com a duracao cheia de novo (ver comentario em
    // `rotationTimerRemainingMsRef` no topo do arquivo).
    for (const [trackId, timerId] of rotationTimersRef.current) {
      window.clearTimeout(timerId)
      const startedAt = rotationTimerStartedAtRef.current.get(trackId)
      const minutes = timeSegmentationMinutesRef.current
      if (startedAt !== undefined && minutes !== null) {
        const elapsed = Date.now() - startedAt
        rotationTimerRemainingMsRef.current.set(trackId, Math.max(0, minutes * 60_000 - elapsed))
      }
    }
    rotationTimersRef.current.clear()

    const trackIds = Array.from(trackRecordersRef.current.keys())
    await Promise.all(
      trackIds.map((trackId) =>
        withTrackLock(trackId, async () => {
          const trackState = trackRecordersRef.current.get(trackId)
          if (trackState?.recorder.state === 'recording') {
            trackState.recorder.pause()
          }
        })
      )
    )

    setState((prev) => ({ ...prev, status: 'paused' }))
  }, [withTrackLock])

  const resume = useCallback(async () => {
    const projectId = projectIdRef.current
    if (!projectId || trackRecordersRef.current.size === 0) return

    try {
      await window.meetingStudio.recording.resume({ projectId })
    } catch (error) {
      console.error('Falha ao retomar gravacao', error)
      setState((prev) => ({ ...prev, error: 'Falha ao retomar a gravacao.' }))
      return
    }

    const trackIds = Array.from(trackRecordersRef.current.keys())
    await Promise.all(
      trackIds.map((trackId) =>
        withTrackLock(trackId, async () => {
          const trackState = trackRecordersRef.current.get(trackId)
          if (trackState?.recorder.state === 'paused') {
            trackState.recorder.resume()
          }
        })
      )
    )

    if (pausedAtRef.current !== null) {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }

    elapsedIntervalRef.current = window.setInterval(() => {
      setState((prev) => ({
        ...prev,
        elapsedMs: Date.now() - startedAtRef.current - totalPausedMsRef.current
      }))
    }, 250)

    for (const [trackId, remainingMs] of rotationTimerRemainingMsRef.current) {
      scheduleTimeRotation(trackId, remainingMs)
    }
    rotationTimerRemainingMsRef.current.clear()

    setState((prev) => ({ ...prev, status: 'recording', error: null }))
  }, [withTrackLock, scheduleTimeRotation])

  /**
   * RF-016 - marcador com titulo/nota opcionais (digitados na UI ANTES do clique, ver
   * `RecordingControls.tsx` - nenhum modal bloqueante depois). So chama o main quando
   * `status === 'recording'` - o mesmo guard que o main aplica (rejeita durante `PAUSED`),
   * checado aqui tambem pra nao fazer uma chamada IPC fadada a falhar quando o botao, por algum
   * motivo, ainda estiver visivel/habilitado.
   */
  const addMarker = useCallback(async (title?: string, note?: string) => {
    const projectId = projectIdRef.current
    if (!projectId || state.status !== 'recording') return

    try {
      const { marker } = await window.meetingStudio.recording.addMarker({ projectId, title, note })
      setState((prev) => ({ ...prev, markers: [...prev.markers, marker] }))
    } catch (error) {
      console.error('Falha ao adicionar marcador', error)
      setState((prev) => ({ ...prev, error: 'Falha ao adicionar marcador.' }))
    }
  }, [state.status])

  const stop = useCallback(async () => {
    const projectId = projectIdRef.current
    const trackRecorders = trackRecordersRef.current
    if (!projectId || trackRecorders.size === 0) return

    setState((prev) => ({ ...prev, status: 'stopping' }))
    // Sincrono, antes de qualquer await - impede que uma rotacao ja enfileirada no lock de uma
    // trilha (auto-rotacao por tempo/tamanho) reabra um recorder novo depois que a gravacao ja
    // deveria estar parada (mesma correcao aplicada no lado main via `track.stopped`).
    stoppedRef.current = true

    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current)
      elapsedIntervalRef.current = null
    }
    if (diskSpaceIntervalRef.current !== null) {
      window.clearInterval(diskSpaceIntervalRef.current)
      diskSpaceIntervalRef.current = null
    }
    for (const timerId of rotationTimersRef.current.values()) window.clearTimeout(timerId)
    rotationTimersRef.current.clear()

    const trackIds = Array.from(trackRecorders.keys())
    await Promise.all(
      trackIds.map((trackId) =>
        withTrackLock(trackId, async () => {
          const trackState = trackRecorders.get(trackId)
          if (!trackState) return
          await new Promise<void>((resolveStop) => {
            trackState.recorder.addEventListener('stop', () => resolveStop(), { once: true })
            trackState.recorder.stop()
          })
          await trackState.sendQueue
        })
      )
    )

    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    systemAudioStreamRef.current?.getTracks().forEach((track) => track.stop())
    systemAudioStreamRef.current = null

    try {
      await window.meetingStudio.recording.stop({ projectId })
      // RF-042: `autoStopReasonRef` carrega a mensagem amigavel quando este `stop()` foi disparado
      // automaticamente pelo monitor de disco (nao pelo usuario clicando "Parar") - `null` no
      // caminho normal, preservando o comportamento existente (sem erro apos parar manualmente).
      setState({
        status: 'idle',
        elapsedMs: 0,
        error: autoStopReasonRef.current,
        markers: [],
        diskSpaceStatus: null,
        freeDiskBytes: null
      })
    } catch (error) {
      console.error('Falha ao finalizar gravacao', error)
      setState({
        status: 'idle',
        elapsedMs: 0,
        error: 'Falha ao finalizar a gravacao.',
        markers: [],
        diskSpaceStatus: null,
        freeDiskBytes: null
      })
    } finally {
      trackRecorders.clear()
      trackLocksRef.current.clear()
      rotationInFlightRef.current.clear()
      rotationTimerStartedAtRef.current.clear()
      rotationTimerRemainingMsRef.current.clear()
      pausedAtRef.current = null
      projectIdRef.current = null
      autoStopReasonRef.current = null
    }
  }, [withTrackLock])

  /**
   * RF-042 - roda a cada `DISK_SPACE_POLL_INTERVAL_MS` durante uma sessao ativa (gravando OU
   * pausada). Le os limiares de Configuracoes A CADA tick (nao cacheados em refs uma unica vez no
   * `start()`, diferente da segmentacao) - decisao deliberada: um monitor de seguranca deve
   * reagir a uma mudanca de configuracao imediatamente, mesmo no meio de uma gravacao ja em
   * andamento, ao contrario de um parametro de formato do artefato (segmentacao) que faz mais
   * sentido fixo pelo resto da sessao.
   */
  const pollDiskSpace = useCallback(async () => {
    if (!projectIdRef.current) return
    try {
      const [diskSpace, presetsRaw] = await Promise.all([
        window.meetingStudio.system.getDiskSpace(),
        window.meetingStudio.settings.get('recordingPresets')
      ])
      const presets = RecordingPresetsSettingsSchema.parse(presetsRaw)
      const diskSpaceStatus = classifyDiskSpace(
        diskSpace.freeBytes,
        presets.diskSpaceWarningThresholdMb,
        presets.diskSpaceCriticalThresholdMb
      )
      setState((prev) => ({ ...prev, diskSpaceStatus, freeDiskBytes: diskSpace.freeBytes }))

      if (diskSpaceStatus === 'critical') {
        // 04_RECORDING_ENGINE.md secao 11 ("Falta de disco"): nivel critico = "stop-safe" - avisar,
        // finalizar segmentos corretamente, encerrar captura de forma controlada. `stop()` ja faz
        // exatamente isso (mesmo caminho de finalizacao usado por um stop manual).
        autoStopReasonRef.current =
          'Gravacao encerrada automaticamente: espaco em disco insuficiente. Libere espaco e inicie uma nova gravacao.'
        await stop()
      }
    } catch (error) {
      // Falha ao VERIFICAR o espaco em disco (ex.: IPC indisponivel momentaneamente) nunca deve
      // interromper a gravacao em andamento - so tenta de novo no proximo tick.
      console.error('Falha ao verificar espaco em disco durante a gravacao', error)
    }
  }, [stop])

  // Mantem `pollDiskSpaceRef` sempre apontando para a versao mais recente (mesmo padrao de
  // `rotateTrackRef` no topo do arquivo) - o timer criado dentro de `start()` chama
  // `pollDiskSpaceRef.current()`, nunca `pollDiskSpace` diretamente, quebrando o ciclo de
  // dependencias entre `start` (definida antes) e `stop`/`pollDiskSpace` (definidas depois, e das
  // quais `pollDiskSpace` depende).
  useEffect(() => {
    pollDiskSpaceRef.current = pollDiskSpace
  }, [pollDiskSpace])

  return { ...state, start, stop, pause, resume, addMarker }
}
