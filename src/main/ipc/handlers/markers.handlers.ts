import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  ListMarkersRequestSchema,
  ListMarkersResponseSchema,
  UpdateMarkerRequestSchema,
  UpdateMarkerResponseSchema,
  DeleteMarkerRequestSchema,
  DeleteMarkerResponseSchema
} from '../../../shared/schemas/markers.schema'
import { registerHandler } from '../ipc-handler'
import { NotFoundError } from '../../../shared/types/domain-errors'
import type { AppContext } from '../../app-context'

/**
 * RF-016 (oitavo incremento - marcadores). So o canal de LEITURA vive aqui - criar um marcador
 * (`recording.addMarker`) fica em `recording.handlers.ts` por depender da sessao de gravacao
 * ativa (ver comentario em `markers.schema.ts`). `listMarkers` no manager delega direto ao
 * `MarkerRepository`, sem exigir sessao ativa - funciona tanto durante quanto depois da gravacao.
 *
 * Refinamento pós-LIB-PLAYER: `update`/`delete` tambem vivem aqui (nunca dependem de sessao ativa,
 * mesmo raciocinio de `list`) - direto no `MarkerRepository`, sem passar pelo
 * `RecordingSessionManager` (que so orquestra a sessao EM ANDAMENTO).
 */
export function registerMarkersHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.markers.list,
    { request: ListMarkersRequestSchema, response: ListMarkersResponseSchema },
    async (request) => context.recordingSessionManager.listMarkers(request.projectId)
  )

  registerHandler(
    IPC_CHANNELS.markers.update,
    { request: UpdateMarkerRequestSchema, response: UpdateMarkerResponseSchema },
    async (request) => {
      const existing = context.markerRepository.findById(request.id)
      if (!existing) {
        throw new NotFoundError(`Marcador nao encontrado: ${request.id}`)
      }
      const patch: Partial<Pick<typeof existing, 'title' | 'note'>> = {}
      if (request.title !== undefined) patch.title = request.title
      if (request.note !== undefined) patch.note = request.note
      context.markerRepository.update(request.id, patch)
      return { ...existing, ...patch }
    }
  )

  registerHandler(
    IPC_CHANNELS.markers.delete,
    { request: DeleteMarkerRequestSchema, response: DeleteMarkerResponseSchema },
    async (request) => {
      const existing = context.markerRepository.findById(request.id)
      if (!existing) return { deleted: false }
      context.markerRepository.delete(request.id)
      return { deleted: true }
    }
  )
}
