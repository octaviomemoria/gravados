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
