import { IPC_CHANNELS } from '../../shared/contracts/channels'
import {
  CreateEditProjectRequestSchema,
  CreateEditProjectResponseSchema,
  GetEditProjectRequestSchema,
  GetEditProjectResponseSchema,
  ListEditProjectsRequestSchema,
  ListEditProjectsResponseSchema
} from '../../shared/schemas/editor.schema'
import type { EditorApi } from '../../shared/types/preload-api'
import { invokeChannel } from '../invoke'

export function createEditorApi(): EditorApi {
  return {
    create: (projectId: string, name?: string) =>
      invokeChannel(
        IPC_CHANNELS.editor.create,
        { request: CreateEditProjectRequestSchema, response: CreateEditProjectResponseSchema },
        { projectId, name }
      ),
    get: (id: string) =>
      invokeChannel(
        IPC_CHANNELS.editor.get,
        { request: GetEditProjectRequestSchema, response: GetEditProjectResponseSchema },
        { id }
      ),
    list: () =>
      invokeChannel(
        IPC_CHANNELS.editor.list,
        { request: ListEditProjectsRequestSchema, response: ListEditProjectsResponseSchema },
        undefined
      )
  }
}
