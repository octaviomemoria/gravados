import type { TrackType } from '@shared/types/entities'

/**
 * Rotulos em portugues para os tipos de trilha (RF-002/003/004/005) - compartilhado entre a
 * Biblioteca (detalhes por trilha, LIB-002) e a timeline do editor (EDIT-002), as duas telas que
 * precisam exibir o tipo de trilha para o usuario final.
 */
export const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  SCREEN: 'Tela',
  CAMERA: 'Câmera',
  MICROPHONE: 'Microfone',
  SYSTEM_AUDIO: 'Áudio do sistema'
}
