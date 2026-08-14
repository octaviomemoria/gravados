import { useCallback, useEffect, useRef, useState } from 'react'
import { buildMeetingMediaUrl } from '@shared/constants/media-protocol'
import { findClipAtTime, clipLocalTimeSeconds, isDrifting } from './timeline-playback'
import type { GetTimelineResponse, TimelineTrack } from '@shared/schemas/editor.schema'

/**
 * EDIT-003 parte 2 (decimo sexto incremento - Fase 3, Editor MVP). Motor de reproducao
 * multi-trilha SINCRONIZADA: ate 4 elementos `<video>`/`<audio>` (um por trilha) tocando juntos,
 * cada um trocando de arquivo automaticamente ao cruzar uma fronteira de segmento/rotacao. Nao
 * importa `electron` - segue a convencao ja estabelecida no projeto de manter hooks que manipulam
 * APIs de midia do navegador (ver `useRecordingSession.ts`) sem teste unitario direto (dificil e
 * de baixo valor mockar `HTMLMediaElement`/`requestAnimationFrame`); a logica pura por tras dele
 * (`timeline-playback.ts`) e testada isoladamente. Cobertura real fica com o teste E2E.
 *
 * DESIGN: um "relogio mestre" em software (`requestAnimationFrame` + `performance.now()`), nao o
 * `timeupdate` de um elemento "lider". Deixar um <video>/<audio> real ditar o relogio e fragil -
 * ele para de disparar eventos exatamente durante a troca de `src` na fronteira de um clip, que e
 * o momento mais critico para sincronizar as OUTRAS trilhas. Com um relogio independente, cada
 * elemento so precisa ser corrigido (seek) quando se desvia do relogio alem de
 * `DRIFT_THRESHOLD_SECONDS` - suficiente para uma ferramenta de revisao, sem pretender ser
 * sample-accurate como um editor profissional.
 */
export interface MultiTrackPlayback {
  playheadMs: number
  totalMs: number
  isPlaying: boolean
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (ms: number) => void
  /** Ref-callback estavel por trilha (mesma identidade entre renders) para anexar ao elemento
   * `<video>`/`<audio>` daquela trilha. */
  getTrackRef: (trackId: string) => (el: HTMLMediaElement | null) => void
}

export function useMultiTrackPlayback(timeline: GetTimelineResponse | null): MultiTrackPlayback {
  const [playheadMs, setPlayheadMsState] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const totalMs = timeline?.totalDurationMs ?? 0

  const playheadMsRef = useRef(0)
  const isPlayingRef = useRef(false)
  const elementsRef = useRef(new Map<string, HTMLMediaElement>())
  const trackRefCallbacksRef = useRef(new Map<string, (el: HTMLMediaElement | null) => void>())
  const loadedSegmentRef = useRef(new Map<string, string>())
  const rafRef = useRef<number | null>(null)
  const anchorRef = useRef<{ wallMs: number; playheadMs: number } | null>(null)
  // Ref para o `tick` mais recente - `requestAnimationFrame` precisa de uma referencia estavel
  // para se re-agendar (a propria funcao `tick`, memoizada via `useCallback`, muda de identidade
  // a cada mudanca em suas dependencias; chamar atraves do ref sempre pega a versao atual sem
  // precisar declarar `tick` antes de si mesma).
  const tickRef = useRef<(wallNow: number) => void>(() => {})

  const setPlayheadMs = useCallback((ms: number) => {
    playheadMsRef.current = ms
    setPlayheadMsState(ms)
  }, [])

  const applyTimeToTrack = useCallback(
    (track: TimelineTrack, globalMs: number, forceSeek: boolean) => {
      const el = elementsRef.current.get(track.id)
      if (!el || !timeline) return
      const clip = findClipAtTime(track.clips, globalMs)
      if (!clip) {
        // Fora da cobertura desta trilha (antes do primeiro clip, depois do ultimo, ou num gap) -
        // so pausa; nao mexe no src para nao produzir um flash de "carregando" desnecessario.
        if (!el.paused) el.pause()
        return
      }
      const localSeconds = clipLocalTimeSeconds(clip, globalMs)
      const loadedSegmentId = loadedSegmentRef.current.get(track.id)
      if (loadedSegmentId !== clip.segmentId) {
        el.src = buildMeetingMediaUrl(timeline.projectId, clip.relativePath)
        loadedSegmentRef.current.set(track.id, clip.segmentId)
        el.currentTime = localSeconds
        if (isPlayingRef.current) void el.play().catch(() => {})
      } else if (forceSeek || isDrifting(el.currentTime, localSeconds)) {
        el.currentTime = localSeconds
      }
    },
    [timeline]
  )

  const applyTimeToAllTracks = useCallback(
    (globalMs: number, forceSeek: boolean) => {
      if (!timeline) return
      for (const track of timeline.tracks) applyTimeToTrack(track, globalMs, forceSeek)
    },
    [timeline, applyTimeToTrack]
  )

  const pause = useCallback(() => {
    isPlayingRef.current = false
    setIsPlaying(false)
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    anchorRef.current = null
    elementsRef.current.forEach((el) => {
      if (!el.paused) el.pause()
    })
  }, [])

  const tick = useCallback(
    (wallNow: number) => {
      if (!anchorRef.current) return
      const elapsedMs = wallNow - anchorRef.current.wallMs
      const nextMs = Math.min(totalMs, anchorRef.current.playheadMs + elapsedMs)
      setPlayheadMs(nextMs)
      applyTimeToAllTracks(nextMs, false)
      if (nextMs >= totalMs) {
        pause()
        return
      }
      rafRef.current = requestAnimationFrame(tickRef.current)
    },
    [totalMs, applyTimeToAllTracks, pause, setPlayheadMs]
  )

  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  const play = useCallback(() => {
    if (!timeline || totalMs <= 0) return
    // Recomeca do inicio se estava parado exatamente no fim (comportamento esperado de "play"
    // apos o fim natural da reproducao).
    const startMs = playheadMsRef.current >= totalMs ? 0 : playheadMsRef.current
    setPlayheadMs(startMs)
    isPlayingRef.current = true
    setIsPlaying(true)
    anchorRef.current = { wallMs: performance.now(), playheadMs: startMs }
    applyTimeToAllTracks(startMs, true)
    rafRef.current = requestAnimationFrame(tickRef.current)
  }, [timeline, totalMs, applyTimeToAllTracks, setPlayheadMs])

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause()
    else play()
  }, [pause, play])

  const seek = useCallback(
    (ms: number) => {
      if (!timeline) return
      const clamped = Math.max(0, Math.min(totalMs, ms))
      setPlayheadMs(clamped)
      applyTimeToAllTracks(clamped, true)
      if (isPlayingRef.current) {
        anchorRef.current = { wallMs: performance.now(), playheadMs: clamped }
      }
    },
    [timeline, totalMs, applyTimeToAllTracks, setPlayheadMs]
  )

  const getTrackRef = useCallback((trackId: string) => {
    let fn = trackRefCallbacksRef.current.get(trackId)
    if (!fn) {
      fn = (el: HTMLMediaElement | null) => {
        if (el) elementsRef.current.set(trackId, el)
        else elementsRef.current.delete(trackId)
      }
      trackRefCallbacksRef.current.set(trackId, fn)
    }
    return fn
  }, [])

  // Pre-carrega o instante 0 em cada trilha assim que os elementos montam, para que o preview
  // mostre um frame real sem precisar apertar "play" primeiro. So mexe no DOM dos elementos
  // (`applyTimeToAllTracks`), nunca em state React, de proposito - resetar o ESTADO do player
  // (playhead/isPlaying) quando o usuario navega para outro projeto de edicao e responsabilidade
  // do `key={editProject.id}` no componente pai (`EditorProjectPage`), que remonta a subarvore
  // inteira - o padrao recomendado pelo React para "resetar estado quando um id muda", em vez de
  // um efeito chamando setState de forma sincrona.
  useEffect(() => {
    applyTimeToAllTracks(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline?.editProjectId])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { playheadMs, totalMs, isPlaying, play, pause, togglePlay, seek, getTrackRef }
}
