import { z } from 'zod'
import { JOB_STATUSES } from '../types/job'
import { IdSchema, IsoDateTimeSchema } from './common.schema'

/**
 * AI-001 (trigesimo segundo incremento - Fase 5, "Transcrição", `11_ROADMAP_BACKLOG.md`).
 * Abstração de provedor - so o CONTRATO (schemas/IPC/tabelas), nenhuma
 * chamada de rede real ainda. `TranscriptionService` (main) sempre rejeita `transcription.start`
 * nesta fase (nenhum provedor registrado em `app-context.ts`) - mesmo padrão deliberado já usado
 * por `export.start` em EXP-001/002, antes do FFmpeg real ser conectado em EXP-002/003. A
 * integração real com um provedor pago (OpenAI, RF conforme `11_ROADMAP_BACKLOG.md` AI-002) fica
 * pra um incremento seguinte - envolve custo real (chave de API do usuário) e envio de áudio a um
 * serviço externo, que `09_SECURITY_PRIVACY_COMPLIANCE.md` §11 exige avisar explicitamente ANTES
 * do primeiro envio - uma decisão de produto/privacidade do usuário, não uma escolha técnica
 * livre pra delegar.
 */

/** `OPENAI` continua sem implementação real (bloqueado esperando o usuário - custo + envio de
 * áudio a um serviço externo, ver comentário acima). `WHISPER_LOCAL` (refinamento pós-SEARCH-001)
 * é o provedor padrão de fato: roda 100% na máquina do usuário via `@huggingface/transformers`
 * (Whisper convertido pra ONNX), sem chamada de rede por reunião (só no primeiro download do
 * modelo escolhido) e sem custo - por isso não passa pelo mesmo gate de consentimento/API key. */
export const TranscriptionProviderIdSchema = z.enum(['OPENAI', 'WHISPER_LOCAL'])
export type TranscriptionProviderId = z.infer<typeof TranscriptionProviderIdSchema>

export const TranscriptionJobStatusSchema = z.enum(JOB_STATUSES)

export const TranscriptionJobResponseSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  status: TranscriptionJobStatusSchema,
  progress: z.number().int().min(0).max(100),
  provider: TranscriptionProviderIdSchema,
  language: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable()
})
export type TranscriptionJobResponse = z.infer<typeof TranscriptionJobResponseSchema>

export const TranscriptSegmentResponseSchema = z.object({
  id: IdSchema,
  transcriptId: IdSchema,
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  speaker: z.string().nullable(),
  text: z.string(),
  confidence: z.number().min(0).max(1).nullable()
})
export type TranscriptSegmentResponse = z.infer<typeof TranscriptSegmentResponseSchema>

export const TranscriptResponseSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  provider: TranscriptionProviderIdSchema,
  model: z.string(),
  language: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  segments: z.array(TranscriptSegmentResponseSchema)
})
export type TranscriptResponse = z.infer<typeof TranscriptResponseSchema>

/** `language` opcional - omitido deixa o provedor detectar automaticamente (comportamento padrão
 * de APIs de transcrição reais, incluindo a da OpenAI) - nunca um valor "chutado" por este app. */
export const StartTranscriptionRequestSchema = z.object({
  projectId: IdSchema,
  language: z.string().min(2).max(10).optional()
})
export type StartTranscriptionRequest = z.infer<typeof StartTranscriptionRequestSchema>
export const StartTranscriptionResponseSchema = TranscriptionJobResponseSchema

export const ListTranscriptionJobsRequestSchema = z.object({ projectId: IdSchema })
export type ListTranscriptionJobsRequest = z.infer<typeof ListTranscriptionJobsRequestSchema>
export const ListTranscriptionJobsResponseSchema = z.array(TranscriptionJobResponseSchema)

export const GetTranscriptionStatusRequestSchema = z.object({ id: IdSchema })
export type GetTranscriptionStatusRequest = z.infer<typeof GetTranscriptionStatusRequestSchema>
export const GetTranscriptionStatusResponseSchema = TranscriptionJobResponseSchema

export const GetTranscriptRequestSchema = z.object({ projectId: IdSchema })
export type GetTranscriptRequest = z.infer<typeof GetTranscriptRequestSchema>
/** `null` quando o projeto ainda nao tem nenhum transcript `COMPLETED` - nunca um erro, o
 * chamador (UI) decide como reagir (mostrar "ainda nao transcrito"), mesmo padrao ja usado por
 * outras consultas opcionais deste app. */
export const GetTranscriptResponseSchema = TranscriptResponseSchema.nullable()
