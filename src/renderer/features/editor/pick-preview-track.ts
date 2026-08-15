import type { TimelineTrack } from '@shared/schemas/editor.schema'

const VIDEO_TRACK_TYPES: ReadonlyArray<TimelineTrack['type']> = ['SCREEN', 'CAMERA']

/**
 * EDIT-003 (decimo quarto incremento - Fase 3, preview). Escolhe qual trilha usar no preview
 * MINIMO desta etapa (uma unica trilha por vez - sincronizar todas simultaneamente e um
 * incremento futuro, dado o tamanho do desafio de multi-track playback). Prioriza vídeo (tela,
 * depois câmera) sobre áudio - ver a tela/câmera é mais informativo do que só ouvir; cai para a
 * primeira trilha de áudio disponível se nenhuma trilha de vídeo sobreviveu na gravação (ex.:
 * gravação só de microfone).
 */
export function pickPreviewTrack(tracks: TimelineTrack[]): TimelineTrack | null {
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
