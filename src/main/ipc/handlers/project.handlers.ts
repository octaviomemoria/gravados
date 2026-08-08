import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  ListProjectsRequestSchema,
  ListProjectsResponseSchema,
  GetProjectRequestSchema,
  GetProjectResponseSchema
} from '../../../shared/schemas/project.schema'
import { NotFoundError } from '../../../shared/types/domain-errors'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/** RF-001, RF-017: criar/listar/consultar reunioes. Handlers reais nesta fase. */
export function registerProjectHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.project.create,
    { request: CreateProjectRequestSchema, response: CreateProjectResponseSchema },
    async (request) => context.projectService.createProject(request.title, request.notes)
  )

  registerHandler(
    IPC_CHANNELS.project.list,
    { request: ListProjectsRequestSchema, response: ListProjectsResponseSchema },
    async () => context.projectService.listProjects()
  )

  registerHandler(
    IPC_CHANNELS.project.get,
    { request: GetProjectRequestSchema, response: GetProjectResponseSchema },
    async (request) => {
      const project = context.projectService.getProject(request.id)
      if (!project) throw new NotFoundError(`Projeto nao encontrado: ${request.id}`)
      return project
    }
  )
}
