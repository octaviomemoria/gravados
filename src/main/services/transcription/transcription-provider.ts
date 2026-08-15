import type { TranscriptionProviderId } from '../../../shared/schemas/transcription.schema'

/** Um segmento cru devolvido pelo provedor - ainda sem `id`/`transcriptId` (atribuidos pelo
 * `TranscriptionService` so no momento de persistir, ver `TranscriptRepository.createWithSegments`). */
export interface TranscribedSegment {
  startMs: number
  endMs: number
  speaker?: string
  text: string
  confidence?: number
}

export interface TranscriptionRequest {
  /** Caminho local de um arquivo de audio ja mixado (WAV/M4A) - o `TranscriptionService` e quem
   * produz esse arquivo (reusando o mesmo pipeline de `buildAudioFfmpegArgs`, EXP-005), nunca o
   * provedor. */
  audioPath: string
  /** Codigo de idioma ISO 639-1 (`pt`, `en`, ...) - omitido deixa o provedor detectar sozinho. */
  language?: string
}

export interface TranscriptionResult {
  model: string
  language: string | null
  segments: TranscribedSegment[]
}

/**
 * AI-001 (Fase 5) - o CONTRATO que qualquer provedor real (AI-002: OpenAI) precisa implementar.
 * Deliberadamente a UNICA peca desta abstracao que ainda nao tem implementacao concreta nesta
 * fase - `TranscriptionService` recebe um `TranscriptionProvider | undefined` no construtor,
 * sempre `undefined` em `app-context.ts` por enquanto (ver comentario la). Uma implementacao real
 * chamaria uma API paga com a chave do PROPRIO usuario e enviaria o audio da reuniao a um
 * servidor externo - uma decisao de custo/privacidade do usuario, nunca algo a supor por padrao.
 */
export interface TranscriptionProvider {
  readonly id: TranscriptionProviderId
  transcribe(
    request: TranscriptionRequest,
    onProgress: (percent: number) => void
  ): Promise<TranscriptionResult>
}
