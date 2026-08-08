import { z } from 'zod'
import { RECORDING_STATES } from '../types/recording-state'
import { IdSchema, IsoDateTimeSchema, EmptyRequestSchema } from './common.schema'

export const ProjectStatusSchema = z.enum(RECORDING_STATES)

export const ProjectResponseSchema = z.object({
  id: IdSchema,
  title: z.string(),
  createdAt: IsoDateTimeSchema,
  startedAt: IsoDateTimeSchema.nullable(),
  endedAt: IsoDateTimeSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  status: ProjectStatusSchema,
  rootPath: z.string(),
  notes: z.string().nullable()
})
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional()
})
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>
export const CreateProjectResponseSchema = ProjectResponseSchema

export const ListProjectsRequestSchema = EmptyRequestSchema
export const ListProjectsResponseSchema = z.array(ProjectResponseSchema)

export const GetProjectRequestSchema = z.object({ id: IdSchema })
export type GetProjectRequest = z.infer<typeof GetProjectRequestSchema>
export const GetProjectResponseSchema = ProjectResponseSchema
