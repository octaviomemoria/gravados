import { z } from 'zod'
import { JOB_STATUSES } from '../types/job'
import { IdSchema, IsoDateTimeSchema, EmptyRequestSchema } from './common.schema'

export const JobStatusSchema = z.enum(JOB_STATUSES)

/** EXP-003/004 (vigesimo quinto incremento - Fase 4, `main/media/render-plan.ts`
 * `ExportResolution`). Duplicado aqui (nao importado de `render-plan.ts`, que e main-only) porque
 * este schema precisa ser consumido pelo renderer tambem - mesma razao de `shared/` existir. */
export const ExportResolutionSchema = z.enum(['HD_720P', 'FULL_HD_1080P'])
export type ExportResolution = z.infer<typeof ExportResolutionSchema>

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

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4). `resolution` obrigatorio - a UI decide entre
 * 720p (EXP-003) e 1080p (EXP-004), a mesma operacao parametrizada (nao dois canais separados,
 * mesmo raciocinio ja usado pra outras diferencas de "so um parametro" ao longo do app).
 */
export const StartExportRequestSchema = z.object({
  editProjectId: IdSchema,
  resolution: ExportResolutionSchema
})
export type StartExportRequest = z.infer<typeof StartExportRequestSchema>
export const StartExportResponseSchema = ExportJobResponseSchema

export const ListExportJobsRequestSchema = EmptyRequestSchema
export const ListExportJobsResponseSchema = z.array(ExportJobResponseSchema)

export const GetExportStatusRequestSchema = z.object({ id: IdSchema })
export type GetExportStatusRequest = z.infer<typeof GetExportStatusRequestSchema>
export const GetExportStatusResponseSchema = ExportJobResponseSchema
