import type { TranscriptResponse } from '@shared/schemas/transcription.schema'

/**
 * Refinamento pos-MVP (pedido real do usuario - "abrir a transcricao numa caixa de texto
 * editavel"). Funcao pura extraida so pra ser testavel isoladamente: `editedText` (quando o
 * usuario ja salvou uma edicao manual, ver `transcripts.editedText` no schema do banco) sempre
 * tem prioridade sobre o texto original; caso contrario junta o `text` de cada segmento, na ordem
 * em que ja vem (`transcriptRepository.listSegments` ordena por `startMs`), com um espaco simples
 * entre eles - os segmentos do Whisper ja vem com pontuacao/espacamento proprios, sem newline.
 */
export function transcriptDisplayText(transcript: TranscriptResponse): string {
  if (transcript.editedText !== null) return transcript.editedText
  return transcript.segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(' ')
}
