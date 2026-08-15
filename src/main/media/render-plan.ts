import { dbToLinearVolume } from '../../shared/media/audio-gain'
import { computePreviewLayout, isVideoTrackType } from '../../shared/media/preview-layout'
import type {
  GetEditedTimelineResponse,
  TimelineTrack,
  CameraShape
} from '../../shared/schemas/editor.schema'

/**
 * EXP-001 (vigesimo quarto incremento - Fase 4, `05_MEDIA_EDITOR.md` §12-13, "Timeline
 * Compiler"). Traduz a timeline EDITADA (`EditorService.getEditedTimeline` - cortes/ganho/fade/
 * transformacao de camera/layout ja todos aplicados) numa estrutura intermediaria que descreve O
 * QUE renderizar, sem ainda gerar nenhum comando FFmpeg (isso e o "FFmpeg Plan", um passo
 * SEGUINTE - EXP-003 em diante). Doc: "Nao gerar comandos FFmpeg diretamente a partir dos
 * componentes React" - esta camada existe justamente pra isolar essa responsabilidade.
 *
 * Reusa `computePreviewLayout` (movida para `shared/media/` neste incremento especificamente por
 * isso) - a mesma logica de "qual trilha e fundo/overlay/lado-a-lado" que decide o preview ao
 * vivo decide o render final. Garante por construcao que o vídeo exportado mostra o MESMO arranjo
 * que o usuário viu no editor - nunca duas implementacoes que podem divergir silenciosamente.
 */

export type ExportResolution = 'HD_720P' | 'FULL_HD_1080P'

const RESOLUTION_DIMENSIONS: Record<ExportResolution, { width: number; height: number }> = {
  HD_720P: { width: 1280, height: 720 },
  FULL_HD_1080P: { width: 1920, height: 1080 }
}

/** Um trecho contíguo de UM arquivo de origem a incluir no render, já com o offset/duracao
 * corretos (pos-REMOVE_RANGE) e a posicao no eixo do vídeo de SAÍDA. */
export interface RenderClip {
  relativePath: string
  sourceStartMs: number
  durationMs: number
  timelineStartMs: number
}

export interface RenderVideoLayer {
  trackId: string
  clips: RenderClip[]
}

export interface RenderOverlayLayer extends RenderVideoLayer {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  shape: CameraShape
}

/** Ganho/fade JA resolvidos pra volume linear (`dbToLinearVolume`) - o construtor de comando
 * FFmpeg (incremento futuro) so precisa saber "multiplicar por isto" e "por quanto tempo
 * rampar no inicio/fim", sem reimplementar a conversao dB->linear. */
export interface RenderAudioLayer {
  trackId: string
  clips: RenderClip[]
  volume: number
  fadeInMs: number
  fadeOutMs: number
}

export interface RenderOutputSettings {
  width: number
  height: number
  startMs: number
  endMs: number
}

export interface RenderPlan {
  editProjectId: string
  /** `null` quando a gravacao nao tem NENHUMA trilha de video sobrevivente (audio-only) - o
   * comando FFmpeg (incremento futuro) decide entre gerar so audio ou rejeitar, conforme o
   * formato de saida pedido (EXP-005). */
  background: RenderVideoLayer | null
  /** So preenchido quando `layoutPreset` resolve pra `side-by-side` (ver `computePreviewLayout`) -
   * a trilha da DIREITA (camera); `background` carrega a da ESQUERDA (tela) nesse caso. */
  sideBySideRight: RenderVideoLayer | null
  /** So preenchido quando `layoutPreset` resolve pra `pip` - a camera sobreposta, com a posicao/
   * tamanho/forma vindos de `cameraTransform` (EDIT-010). */
  overlay: RenderOverlayLayer | null
  /** Uma entrada por trilha NAO MUTADA (uma trilha `muted` simplesmente nao contribui audio
   * nenhum ao mix - equivalente a `volume: 0`, mas sem gastar um input do FFmpeg a toa). */
  audio: RenderAudioLayer[]
  output: RenderOutputSettings
}

function toRenderClips(track: TimelineTrack): RenderClip[] {
  return track.clips.map((clip) => ({
    relativePath: clip.relativePath,
    sourceStartMs: clip.sourceStartMs,
    durationMs: Math.max(0, clip.endMs - clip.startMs),
    timelineStartMs: clip.startMs
  }))
}

function toVideoLayer(track: TimelineTrack): RenderVideoLayer {
  return { trackId: track.id, clips: toRenderClips(track) }
}

function toOverlayLayer(track: TimelineTrack): RenderOverlayLayer {
  // `pickOverlayCameraTrack`/`computePreviewLayout` so retornam uma trilha CAMERA como overlay
  // quando `cameraTransform` esta presente (garantido por `EditorService.getTimeline` - toda
  // trilha CAMERA sempre tem um `cameraTransform` nao-nulo, ver `DEFAULT_CAMERA_TRANSFORM`).
  const transform = track.cameraTransform!
  return {
    trackId: track.id,
    clips: toRenderClips(track),
    xPercent: transform.xPercent,
    yPercent: transform.yPercent,
    widthPercent: transform.widthPercent,
    heightPercent: transform.heightPercent,
    shape: transform.shape
  }
}

function toAudioLayer(track: TimelineTrack): RenderAudioLayer {
  return {
    trackId: track.id,
    clips: toRenderClips(track),
    volume: dbToLinearVolume(track.gainDb),
    fadeInMs: track.fadeInMs,
    fadeOutMs: track.fadeOutMs
  }
}

export interface BuildRenderPlanOptions {
  resolution: ExportResolution
  /** EXP-006 (faixa de tempo) - `null`/omitido exporta a timeline inteira. Validado contra
   * `totalDurationMs` pelo chamador (`ExportService`), nao aqui - esta funcao e pura e nao lanca. */
  rangeMs?: { startMs: number; endMs: number } | null
}

export function buildRenderPlan(
  timeline: GetEditedTimelineResponse,
  options: BuildRenderPlanOptions
): RenderPlan {
  const layout = computePreviewLayout(timeline.tracks, timeline.layoutPreset)
  const trackById = new Map(timeline.tracks.map((track) => [track.id, track]))

  let background: RenderVideoLayer | null = null
  let sideBySideRight: RenderVideoLayer | null = null
  let overlay: RenderOverlayLayer | null = null

  if (layout.mode === 'single') {
    const track = trackById.get(layout.trackId)
    // `computePreviewLayout`/`pickPreviewTrack` caem pra QUALQUER trilha (mesmo audio) quando a
    // gravacao nao tem nenhuma trilha de video - correto pro preview (o renderer so desenha
    // trilhas de video mesmo, o resto so toca em segundo plano), mas um render plan NAO pode
    // deixar uma trilha de audio passando por "camada de video" - o construtor de comando FFmpeg
    // (incremento futuro) tomaria essa trilha como se tivesse um stream de video pra codificar,
    // o que nao existe. Filtra aqui, no unico ponto que traduz layout -> render plan.
    if (track && isVideoTrackType(track.type)) background = toVideoLayer(track)
  } else if (layout.mode === 'pip') {
    const backgroundTrack = trackById.get(layout.backgroundTrackId)
    const overlayTrack = trackById.get(layout.overlayTrackId)
    if (backgroundTrack) background = toVideoLayer(backgroundTrack)
    if (overlayTrack) overlay = toOverlayLayer(overlayTrack)
  } else if (layout.mode === 'side-by-side') {
    const leftTrack = trackById.get(layout.leftTrackId)
    const rightTrack = trackById.get(layout.rightTrackId)
    if (leftTrack) background = toVideoLayer(leftTrack)
    if (rightTrack) sideBySideRight = toVideoLayer(rightTrack)
  }
  // `layout.mode === 'none'` - gravacao sem nenhuma trilha de video (so audio); os tres campos
  // ficam `null`, o `ExportService` decide o que fazer (audio-only ou rejeitar) num incremento
  // futuro (EXP-005).

  const audio = timeline.tracks.filter((track) => !track.muted).map(toAudioLayer)

  const dimensions = RESOLUTION_DIMENSIONS[options.resolution]
  const range = options.rangeMs ?? { startMs: 0, endMs: timeline.totalDurationMs }

  return {
    editProjectId: timeline.editProjectId,
    background,
    sideBySideRight,
    overlay,
    audio,
    output: {
      width: dimensions.width,
      height: dimensions.height,
      startMs: range.startMs,
      endMs: range.endMs
    }
  }
}
