import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import { SearchTranscriptsRequestSchema, SearchTranscriptsResponseSchema } from '../../../shared/schemas/search.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * SEARCH-001 (trigesimo terceiro incremento - Fase 7). Um unico canal, leitura pura e sincrona
 * (nenhum job assincrono - FTS5 e rapido o bastante pra rodar direto na thread do handler, mesmo
 * padrao de qualquer outra consulta simples deste app, ver `markers.list`/`project.get`).
 */
export function registerSearchHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.search.transcripts,
    { request: SearchTranscriptsRequestSchema, response: SearchTranscriptsResponseSchema },
    async (request) => context.searchService.searchTranscripts(request.query, request.projectId)
  )
}
