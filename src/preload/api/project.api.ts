import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  ListProjectsRequestSchema,
  ListProjectsResponseSchema,
  GetProjectRequestSchema,
  GetProjectResponseSchema,
  GetProjectDetailsRequestSchema,
  ProjectDetailsResponseSchema,
  OpenProjectFolderRequestSchema,
  OpenProjectFolderResponseSchema,
  RenameProjectRequestSchema,
  RenameProjectResponseSchema,
  DeleteProjectRequestSchema,
  DeleteProjectResponseSchema,
  type CreateProjectRequest
} from '../../shared/schemas/project.schema'
import type { ProjectApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createProjectApi(): ProjectApi {
  return {
    create: (request: CreateProjectRequest) =>
      invokeChannel(
        IPC_CHANNELS.project.create,
        { request: CreateProjectRequestSchema, response: CreateProjectResponseSchema },
        request
      ),
    list: () =>
      invokeChannel(
        IPC_CHANNELS.project.list,
        { request: ListProjectsRequestSchema, response: ListProjectsResponseSchema },
        undefined
      ),
    get: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.project.get,
        { request: GetProjectRequestSchema, response: GetProjectResponseSchema },
        { id }
      ),
    getDetails: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.project.getDetails,
        { request: GetProjectDetailsRequestSchema, response: ProjectDetailsResponseSchema },
        { id }
      ),
    openFolder: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.project.openFolder,
        { request: OpenProjectFolderRequestSchema, response: OpenProjectFolderResponseSchema },
        { id }
      ),
    rename: (id: string, title: string) =>
      invokeChannel(
        IPC_CHANNELS.project.rename,
        { request: RenameProjectRequestSchema, response: RenameProjectResponseSchema },
        { id, title }
      ),
    delete: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.project.delete,
        { request: DeleteProjectRequestSchema, response: DeleteProjectResponseSchema },
        { id }
      )
  }
}
