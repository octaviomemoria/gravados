import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  StartTranscriptionRequestSchema,
  StartTranscriptionResponseSchema,
  ListTranscriptionJobsRequestSchema,
  ListTranscriptionJobsResponseSchema,
  GetTranscriptionStatusRequestSchema,
  GetTranscriptionStatusResponseSchema,
  GetTranscriptRequestSchema,
  GetTranscriptResponseSchema,
  UpdateTranscriptTextRequestSchema,
  UpdateTranscriptTextResponseSchema
} from '../../../shared/schemas/transcription.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * AI-001 (trigesimo segundo incremento - Fase 5). `start`/`getStatus`/`list` espelham exatamente
 * `export.*` (mesmo formato de job assincrono). `getTranscript` e a unica leitura nova (sem
 * equivalente em export - o RESULTADO de uma exportacao e um arquivo, nunca uma consulta de
 * banco; o de uma transcricao e sempre uma consulta, ver `TranscriptResponseSchema`).
 */
export function registerTranscriptionHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.transcription.start,
    { request: StartTranscriptionRequestSchema, response: StartTranscriptionResponseSchema },
    async (request) => context.transcriptionService.startTranscription(request.projectId, request.language)
  )

  registerHandler(
    IPC_CHANNELS.transcription.list,
    { request: ListTranscriptionJobsRequestSchema, response: ListTranscriptionJobsResponseSchema },
    async (request) => context.transcriptionService.listJobs(request.projectId)
  )

  registerHandler(
    IPC_CHANNELS.transcription.getStatus,
    { request: GetTranscriptionStatusRequestSchema, response: GetTranscriptionStatusResponseSchema },
    async (request) => context.transcriptionService.getStatus(request.id)
  )

  registerHandler(
    IPC_CHANNELS.transcription.getTranscript,
    { request: GetTranscriptRequestSchema, response: GetTranscriptResponseSchema },
    async (request) => context.transcriptionService.getTranscript(request.projectId)
  )

  registerHandler(
    IPC_CHANNELS.transcription.updateText,
    { request: UpdateTranscriptTextRequestSchema, response: UpdateTranscriptTextResponseSchema },
    async (request) => context.transcriptionService.updateTranscriptText(request.projectId, request.text)
  )
}
