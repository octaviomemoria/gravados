import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  CreateEditProjectRequestSchema,
  CreateEditProjectResponseSchema,
  GetEditProjectRequestSchema,
  GetEditProjectResponseSchema,
  ListEditProjectsRequestSchema,
  ListEditProjectsResponseSchema
} from '../../../shared/schemas/editor.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/** EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). Delega inteiramente ao
 * `EditorService`, mesmo padrao ja usado por todo dominio existente. */
export function registerEditorHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.editor.create,
    { request: CreateEditProjectRequestSchema, response: CreateEditProjectResponseSchema },
    async (request) => context.editorService.createEditProject(request.projectId, request.name)
  )

  registerHandler(
    IPC_CHANNELS.editor.get,
    { request: GetEditProjectRequestSchema, response: GetEditProjectResponseSchema },
    async (request) => context.editorService.getEditProject(request.id)
  )

  registerHandler(
    IPC_CHANNELS.editor.list,
    { request: ListEditProjectsRequestSchema, response: ListEditProjectsResponseSchema },
    async () => context.editorService.listEditProjects()
  )
}
