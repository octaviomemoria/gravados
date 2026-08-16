import { z } from 'zod'
import { RECORDING_STATES } from '../types/recording-state'
import { TRACK_TYPES } from '../types/entities'
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

/**
 * RF-017 (Biblioteca): abre `rootPath` do projeto no explorador de arquivos do SO. Recebe so o
 * `id` (nunca um path bruto do renderer) - o main resolve o `rootPath` real a partir do banco,
 * garantindo que so pastas de projetos legitimos possam ser abertas (nunca um path arbitrario
 * vindo do lado renderer). `opened: false` (sem lancar erro IPC) cobre o caso nao-excepcional de
 * a pasta ter sido movida/apagada por fora do app - UI mostra mensagem amigavel, nao uma falha.
 */
export const OpenProjectFolderRequestSchema = z.object({ id: IdSchema })
export type OpenProjectFolderRequest = z.infer<typeof OpenProjectFolderRequestSchema>
export const OpenProjectFolderResponseSchema = z.object({ opened: z.boolean() })

/** LIB-004 (decimo primeiro incremento - Fase 2, Biblioteca): apenas o titulo e editavel aqui -
 * `notes` segue sem UI dedicada (mesmo escopo ja registrado em "Pendências conhecidas"). */
export const RenameProjectRequestSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(200)
})
export type RenameProjectRequest = z.infer<typeof RenameProjectRequestSchema>
export const RenameProjectResponseSchema = ProjectResponseSchema

/**
 * LIB-006: exclusao permanente (banco + arvore de diretorios no disco). Recebe so o `id`, mesmo
 * padrao de `OpenProjectFolderRequestSchema` - nunca um path vindo do renderer.
 */
export const DeleteProjectRequestSchema = z.object({ id: IdSchema })
export type DeleteProjectRequest = z.infer<typeof DeleteProjectRequestSchema>
export const DeleteProjectResponseSchema = z.object({ deleted: z.boolean() })

/** Refinamento pos-AI-002-LOCAL - segmento FINALIZADO de uma trilha, exposto pra Biblioteca poder
 * montar um player mínimo (`buildMeetingMediaUrl(projectId, relativePath)`) sem precisar de um
 * projeto de edição (que é o único lugar que já tinha essa informação, via `getTimeline`).
 * Resolve a pendência registrada "getProjectDetails não expõe a lista de segmentos
 * individualmente". */
export const ProjectDetailsSegmentSchema = z.object({
  relativePath: z.string(),
  startedAtMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable()
})
export type ProjectDetailsSegment = z.infer<typeof ProjectDetailsSegmentSchema>

/**
 * LIB-002: resumo por trilha (tipo, quantos segmentos, bytes totais) agregado DIRETO do banco
 * (`segments.byteSize`) - nunca escaneando o disco de novo, já que o próprio banco já mantém o
 * tamanho real de cada segmento finalizado (ver `RecordingSessionManager`/`RecoveryService`).
 */
export const ProjectDetailsTrackSchema = z.object({
  id: IdSchema,
  type: z.enum(TRACK_TYPES),
  segmentCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  segments: z.array(ProjectDetailsSegmentSchema)
})
export type ProjectDetailsTrack = z.infer<typeof ProjectDetailsTrackSchema>

export const GetProjectDetailsRequestSchema = z.object({ id: IdSchema })
export type GetProjectDetailsRequest = z.infer<typeof GetProjectDetailsRequestSchema>
export const ProjectDetailsResponseSchema = ProjectResponseSchema.extend({
  tracks: z.array(ProjectDetailsTrackSchema),
  totalBytes: z.number().int().nonnegative()
})
export type ProjectDetailsResponse = z.infer<typeof ProjectDetailsResponseSchema>
