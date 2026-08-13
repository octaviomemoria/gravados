import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import { ListMarkersRequestSchema, ListMarkersResponseSchema } from '../../../shared/schemas/markers.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * RF-016 (oitavo incremento - marcadores). So o canal de LEITURA vive aqui - criar um marcador
 * (`recording.addMarker`) fica em `recording.handlers.ts` por depender da sessao de gravacao
 * ativa (ver comentario em `markers.schema.ts`). `listMarkers` no manager delega direto ao
 * `MarkerRepository`, sem exigir sessao ativa - funciona tanto durante quanto depois da gravacao.
 */
export function registerMarkersHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.markers.list,
    { request: ListMarkersRequestSchema, response: ListMarkersResponseSchema },
    async (request) => context.recordingSessionManager.listMarkers(request.projectId)
  )
}
