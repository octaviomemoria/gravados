import { shell } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import { SOURCE_ROOT_FOLDER_NAME } from '../../../shared/constants/filesystem'
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
  DeleteProjectResponseSchema
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

  registerHandler(
    IPC_CHANNELS.project.openFolder,
    { request: OpenProjectFolderRequestSchema, response: OpenProjectFolderResponseSchema },
    async (request) => {
      const project = context.projectService.getProject(request.id)
      if (!project) throw new NotFoundError(`Projeto nao encontrado: ${request.id}`)
      // Refinamento pos-LIB-004 (pedido do usuario testando o app: "abrir a pasta cai numa arvore
      // com varias subpastas tecnicas - exports/proxies/recovery/source/thumbnails - antes de
      // chegar nos arquivos de gravacao de verdade"). Abre `source/` direto - onde os arquivos de
      // midia REAIS ficam (`screen/`, `camera/`, `microphone/`, `system-audio/`) - em vez da raiz
      // do projeto. `shell.openPath` retorna uma string de erro (nao lanca) em caso de falha -
      // ex.: pasta movida/apagada por fora do app, ou uma gravacao que nunca produziu nenhum
      // arquivo (pasta `source/` ainda existe, sempre criada no `recording.start`, so vazia).
      // Isso nao e excepcional o suficiente pra virar erro IPC (AGENTS.md/08_UX_FLOWS.md: nunca
      // mostrar codigo/erro cru - a UI trata `opened: false` com mensagem amigavel).
      const sourcePath = join(project.rootPath, SOURCE_ROOT_FOLDER_NAME)
      const errorMessage = await shell.openPath(sourcePath)
      return { opened: errorMessage === '' }
    }
  )

  registerHandler(
    IPC_CHANNELS.project.getDetails,
    { request: GetProjectDetailsRequestSchema, response: ProjectDetailsResponseSchema },
    async (request) => {
      const { project, tracks, totalBytes } = context.projectService.getProjectDetails(request.id)
      return { ...project, tracks, totalBytes }
    }
  )

  registerHandler(
    IPC_CHANNELS.project.rename,
    { request: RenameProjectRequestSchema, response: RenameProjectResponseSchema },
    async (request) =>
      context.projectService.renameProject(request.id, request.title, request.notes)
  )

  registerHandler(
    IPC_CHANNELS.project.delete,
    { request: DeleteProjectRequestSchema, response: DeleteProjectResponseSchema },
    async (request) => {
      await context.projectService.deleteProject(request.id)
      return { deleted: true }
    }
  )
}
