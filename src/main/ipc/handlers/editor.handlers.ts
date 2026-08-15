import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  CreateEditProjectRequestSchema,
  CreateEditProjectResponseSchema,
  GetEditProjectRequestSchema,
  GetEditProjectResponseSchema,
  ListEditProjectsRequestSchema,
  ListEditProjectsResponseSchema,
  GetTimelineRequestSchema,
  GetTimelineResponseSchema,
  GetEditedTimelineRequestSchema,
  GetEditedTimelineResponseSchema,
  RemoveRangeRequestSchema,
  RemoveRangeResponseSchema,
  UndoRequestSchema,
  UndoResponseSchema,
  RedoRequestSchema,
  RedoResponseSchema,
  SetTrackGainRequestSchema,
  SetTrackGainResponseSchema,
  SetTrackFadeRequestSchema,
  SetTrackFadeResponseSchema,
  SetTrackCameraTransformRequestSchema,
  SetTrackCameraTransformResponseSchema
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

  registerHandler(
    IPC_CHANNELS.editor.getTimeline,
    { request: GetTimelineRequestSchema, response: GetTimelineResponseSchema },
    async (request) => context.editorService.getTimeline(request.editProjectId)
  )

  registerHandler(
    IPC_CHANNELS.editor.getEditedTimeline,
    { request: GetEditedTimelineRequestSchema, response: GetEditedTimelineResponseSchema },
    async (request) => context.editorService.getEditedTimeline(request.editProjectId)
  )

  registerHandler(
    IPC_CHANNELS.editor.removeRange,
    { request: RemoveRangeRequestSchema, response: RemoveRangeResponseSchema },
    async (request) =>
      context.editorService.removeRange(request.editProjectId, request.startMs, request.endMs)
  )

  registerHandler(
    IPC_CHANNELS.editor.undo,
    { request: UndoRequestSchema, response: UndoResponseSchema },
    async (request) => context.editorService.undo(request.editProjectId)
  )

  registerHandler(
    IPC_CHANNELS.editor.redo,
    { request: RedoRequestSchema, response: RedoResponseSchema },
    async (request) => context.editorService.redo(request.editProjectId)
  )

  registerHandler(
    IPC_CHANNELS.editor.setTrackGain,
    { request: SetTrackGainRequestSchema, response: SetTrackGainResponseSchema },
    async (request) =>
      context.editorService.setTrackGain(
        request.editProjectId,
        request.trackId,
        request.gainDb,
        request.muted
      )
  )

  registerHandler(
    IPC_CHANNELS.editor.setTrackFade,
    { request: SetTrackFadeRequestSchema, response: SetTrackFadeResponseSchema },
    async (request) =>
      context.editorService.setTrackFade(
        request.editProjectId,
        request.trackId,
        request.fadeInMs,
        request.fadeOutMs
      )
  )

  registerHandler(
    IPC_CHANNELS.editor.setTrackCameraTransform,
    {
      request: SetTrackCameraTransformRequestSchema,
      response: SetTrackCameraTransformResponseSchema
    },
    async (request) =>
      context.editorService.setTrackTransform(request.editProjectId, request.trackId, {
        visible: request.visible,
        xPercent: request.xPercent,
        yPercent: request.yPercent,
        widthPercent: request.widthPercent,
        heightPercent: request.heightPercent,
        shape: request.shape
      })
  )
}
