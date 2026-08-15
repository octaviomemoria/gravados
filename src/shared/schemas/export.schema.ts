import { z } from 'zod'
import { JOB_STATUSES } from '../types/job'
import { IdSchema, IsoDateTimeSchema, EmptyRequestSchema } from './common.schema'

export const JobStatusSchema = z.enum(JOB_STATUSES)

/** EXP-003/004 (vigesimo quinto incremento - Fase 4, `main/media/render-plan.ts`
 * `ExportResolution`). Duplicado aqui (nao importado de `render-plan.ts`, que e main-only) porque
 * este schema precisa ser consumido pelo renderer tambem - mesma razao de `shared/` existir. */
export const ExportResolutionSchema = z.enum(['HD_720P', 'FULL_HD_1080P'])
export type ExportResolution = z.infer<typeof ExportResolutionSchema>

/** EXP-005 (vigesimo sexto incremento - Fase 4, RF-033). M4A/AAC e WAV sempre disponiveis em
 * qualquer build do FFmpeg; MP3 (`libmp3lame`) depende de licenciamento do build - o
 * `ffmpeg-static` instalado (EXP-001/002) confirmadamente inclui `libmp3lame` (`ffmpeg -version`),
 * entao os 3 ficam disponiveis sem nenhuma checagem de capabilities em runtime nesta fase. */
export const AudioExportFormatSchema = z.enum(['M4A', 'MP3', 'WAV'])
export type AudioExportFormat = z.infer<typeof AudioExportFormatSchema>

/**
 * EXP-005 - `target` substitui o antigo campo `resolution` direto (EXP-003/004) por uma uniao
 * discriminada: exportar em VIDEO sempre exige uma resolucao (720p/1080p, RF-032), exportar so em
 * AUDIO exige um formato (M4A/MP3/WAV, RF-033) e nunca uma resolucao (não faz sentido pra um
 * arquivo sem stream de video). Um unico campo `kind` evita dois canais IPC separados pro mesmo
 * conceito ("iniciar uma exportacao") - mesmo raciocinio ja usado em outras partes do app pra
 * "uma operacao parametrizada" em vez de variantes redundantes.
 */
export const ExportTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('VIDEO'), resolution: ExportResolutionSchema }),
  z.object({ kind: z.literal('AUDIO'), format: AudioExportFormatSchema })
])
export type ExportTarget = z.infer<typeof ExportTargetSchema>

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
 * EXP-003/004/005 (vigesimo quinto/sexto incrementos - Fase 4). `target` decide entre exportar em
 * VIDEO (720p/1080p, EXP-003/004) ou so em AUDIO (M4A/MP3/WAV, EXP-005) - a mesma operacao
 * "iniciar exportacao" parametrizada, nao canais IPC separados.
 */
export const StartExportRequestSchema = z.object({
  editProjectId: IdSchema,
  target: ExportTargetSchema
})
export type StartExportRequest = z.infer<typeof StartExportRequestSchema>
export const StartExportResponseSchema = ExportJobResponseSchema

export const ListExportJobsRequestSchema = EmptyRequestSchema
export const ListExportJobsResponseSchema = z.array(ExportJobResponseSchema)

export const GetExportStatusRequestSchema = z.object({ id: IdSchema })
export type GetExportStatusRequest = z.infer<typeof GetExportStatusRequestSchema>
export const GetExportStatusResponseSchema = ExportJobResponseSchema
