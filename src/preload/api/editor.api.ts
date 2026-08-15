import { IPC_CHANNELS } from '../../shared/contracts/channels'
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
  SetTrackFadeResponseSchema
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
      ),
    getTimeline: (editProjectId: string) =>
      invokeChannel(
        IPC_CHANNELS.editor.getTimeline,
        { request: GetTimelineRequestSchema, response: GetTimelineResponseSchema },
        { editProjectId }
      ),
    getEditedTimeline: (editProjectId: string) =>
      invokeChannel(
        IPC_CHANNELS.editor.getEditedTimeline,
        { request: GetEditedTimelineRequestSchema, response: GetEditedTimelineResponseSchema },
        { editProjectId }
      ),
    removeRange: (editProjectId: string, startMs: number, endMs: number) =>
      invokeChannel(
        IPC_CHANNELS.editor.removeRange,
        { request: RemoveRangeRequestSchema, response: RemoveRangeResponseSchema },
        { editProjectId, startMs, endMs }
      ),
    undo: (editProjectId: string) =>
      invokeChannel(
        IPC_CHANNELS.editor.undo,
        { request: UndoRequestSchema, response: UndoResponseSchema },
        { editProjectId }
      ),
    redo: (editProjectId: string) =>
      invokeChannel(
        IPC_CHANNELS.editor.redo,
        { request: RedoRequestSchema, response: RedoResponseSchema },
        { editProjectId }
      ),
    setTrackGain: (editProjectId: string, trackId: string, gainDb: number, muted: boolean) =>
      invokeChannel(
        IPC_CHANNELS.editor.setTrackGain,
        { request: SetTrackGainRequestSchema, response: SetTrackGainResponseSchema },
        { editProjectId, trackId, gainDb, muted }
      ),
    setTrackFade: (editProjectId: string, trackId: string, fadeInMs: number, fadeOutMs: number) =>
      invokeChannel(
        IPC_CHANNELS.editor.setTrackFade,
        { request: SetTrackFadeRequestSchema, response: SetTrackFadeResponseSchema },
        { editProjectId, trackId, fadeInMs, fadeOutMs }
      )
  }
}
