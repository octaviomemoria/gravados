import { z } from 'zod'
import { JOB_STATUSES } from '../types/job'
import { IdSchema, IsoDateTimeSchema, EmptyRequestSchema } from './common.schema'

export const JobStatusSchema = z.enum(JOB_STATUSES)

export const ExportJobResponseSchema = z.object({
  id: IdSchema,
  editProjectId: IdSchema,
  status: JobStatusSchema,
  progress: z.number().int().min(0).max(100),
  outputPath: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable()
})
export type ExportJobResponse = z.infer<typeof ExportJobResponseSchema>

/** Registrado/validado nesta fase; implementacao real e Fase 4 - Export (ver AGENTS.md, escopo). */
export const StartExportRequestSchema = z.object({ editProjectId: IdSchema })
export type StartExportRequest = z.infer<typeof StartExportRequestSchema>
export const StartExportResponseSchema = ExportJobResponseSchema

export const ListExportJobsRequestSchema = EmptyRequestSchema
export const ListExportJobsResponseSchema = z.array(ExportJobResponseSchema)

export const GetExportStatusRequestSchema = z.object({ id: IdSchema })
export type GetExportStatusRequest = z.infer<typeof GetExportStatusRequestSchema>
export const GetExportStatusResponseSchema = ExportJobResponseSchema
