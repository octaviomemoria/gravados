import type { TimelineTrack, LayoutPreset } from '../schemas/editor.schema'

const VIDEO_TRACK_TYPES: ReadonlyArray<TimelineTrack['type']> = ['SCREEN', 'CAMERA']

/**
 * EDIT-003 (decimo quarto incremento - Fase 3, preview). Escolhe qual trilha usar no preview
 * MINIMO desta etapa (uma unica trilha por vez - sincronizar todas simultaneamente e um
 * incremento futuro, dado o tamanho do desafio de multi-track playback). Prioriza vídeo (tela,
 * depois câmera) sobre áudio - ver a tela/câmera é mais informativo do que só ouvir; cai para a
 * primeira trilha de áudio disponível se nenhuma trilha de vídeo sobreviveu na gravação (ex.:
 * gravação só de microfone).
 *
 * EXP-001 (vigesimo quarto incremento - Fase 4, render plan). Movido de
 * `renderer/features/editor/pick-preview-track.ts` para `shared/media/` - o RENDER PLAN
 * (`main/media/render-plan.ts`) precisa da EXATA mesma logica de "qual trilha e fundo/overlay"
 * que o preview ja usa, senao o vídeo exportado poderia mostrar um arranjo DIFERENTE do que o
 * usuário viu no editor (um bug de confiança, nao so cosmético). Reusar a mesma função pura dos
 * dois lados garante que preview e exportação NUNCA divergem por construção.
 *
 * Genérica (`T extends { type: TimelineTrack['type'] }`, não fixada em `TimelineTrack[]`) desde o
 * refinamento pós-AI-002-LOCAL - a Biblioteca reusa a MESMA prioridade tela>câmera>primeira
 * disponível pro player mínimo dos detalhes expandidos, mas só tem `ProjectDetailsTrack[]`
 * (gravação crua, sem projeto de edição) - nunca duplicar esta lógica pra um segundo tipo de
 * trilha.
 */
export function pickPreviewTrack<T extends { type: TimelineTrack['type'] }>(tracks: T[]): T | null {
  for (const type of VIDEO_TRACK_TYPES) {
    const track = tracks.find((candidate) => candidate.type === type)
    if (track) return track
  }
  return tracks[0] ?? null
}

export function isVideoTrackType(type: TimelineTrack['type']): boolean {
  return (VIDEO_TRACK_TYPES as readonly string[]).includes(type)
}

/**
 * EDIT-010 (vigesimo primeiro incremento - Fase 3, transformacao de camera). Alem da trilha de
 * FUNDO (`pickPreviewTrack` acima - tela > camera > primeira disponivel), decide se existe uma
 * trilha CAMERA separada pra sobrepor como picture-in-picture. So faz sentido se: (1) existe uma
 * trilha CAMERA na timeline, (2) ela NAO E a propria trilha de fundo (uma gravacao so-camera nao
 * tem overlay - a camera JA E o fundo, mostrada em tela cheia, sem sentido desenhar ela por cima
 * dela mesma), e (3) `cameraTransform.visible` nao foi explicitamente desligado pelo usuario.
 */
export function pickOverlayCameraTrack(
  tracks: TimelineTrack[],
  backgroundTrackId: string | null
): TimelineTrack | null {
  const camera = tracks.find((candidate) => candidate.type === 'CAMERA')
  if (!camera) return null
  if (camera.id === backgroundTrackId) return null
  if (camera.cameraTransform && !camera.cameraTransform.visible) return null
  return camera
}

/**
 * EDIT-011 (vigesimo segundo incremento - Fase 3, layout, `05_MEDIA_EDITOR.md` §4). Traduz o
 * `layoutPreset` da timeline editada + as trilhas disponiveis num resultado que a UI so precisa
 * desenhar, sem reimplementar a logica de "qual trilha em qual papel" - mesmo espirito de
 * `pickPreviewTrack`/`pickOverlayCameraTrack`, so que decidindo entre os 4 modos possiveis.
 *
 * Cada preset tem um "requisito" de trilhas - `CAMERA_ONLY` precisa de uma trilha `CAMERA`,
 * `SCREEN_ONLY` de uma `SCREEN`, `SIDE_BY_SIDE` de AMBAS. Quando o requisito nao e atendido (ex.:
 * usuario escolhe `CAMERA_ONLY` numa gravacao so de tela), cai de volta pro comportamento `PIP`
 * padrao (`pickPreviewTrack`/`pickOverlayCameraTrack`) - nunca mostra uma tela em branco so porque
 * o preset pedido nao faz sentido pra esta gravacao especifica.
 */
export type PreviewLayout =
  | { mode: 'single'; trackId: string }
  | { mode: 'pip'; backgroundTrackId: string; overlayTrackId: string }
  | { mode: 'side-by-side'; leftTrackId: string; rightTrackId: string }
  | { mode: 'none' }

export function computePreviewLayout(tracks: TimelineTrack[], preset: LayoutPreset): PreviewLayout {
  const screen = tracks.find((track) => track.type === 'SCREEN') ?? null
  const camera = tracks.find((track) => track.type === 'CAMERA') ?? null

  if (preset === 'CAMERA_ONLY' && camera) return { mode: 'single', trackId: camera.id }
  if (preset === 'SCREEN_ONLY' && screen) return { mode: 'single', trackId: screen.id }
  if (preset === 'SIDE_BY_SIDE' && screen && camera) {
    return { mode: 'side-by-side', leftTrackId: screen.id, rightTrackId: camera.id }
  }

  // PIP (padrao) OU um preset cujo requisito nao foi atendido - mesmo comportamento automatico
  // ja entregue pelo EDIT-010.
  const background = pickPreviewTrack(tracks)
  if (!background) return { mode: 'none' }
  const overlay = pickOverlayCameraTrack(tracks, background.id)
  if (!overlay) return { mode: 'single', trackId: background.id }
  return { mode: 'pip', backgroundTrackId: background.id, overlayTrackId: overlay.id }
}
