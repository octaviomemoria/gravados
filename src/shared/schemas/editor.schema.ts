import { z } from 'zod'
import { IdSchema, IsoDateTimeSchema, EmptyRequestSchema } from './common.schema'

/**
 * EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). `EditProject` (06_DATA_MODEL.md) ja
 * existia como tabela desde a Fase 0 (`edit_projects`), sem nenhum canal IPC ate agora. Sem
 * restricao de unicidade em `projectId` deliberadamente (ver `edit-projects.schema.ts`) - o
 * mesmo projeto gravado pode ter varios projetos de edicao independentes (ex.: "versao curta" e
 * "versao completa" da mesma reuniao).
 */
export const EditProjectResponseSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  name: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  revision: z.number().int().positive()
})
export type EditProjectResponse = z.infer<typeof EditProjectResponseSchema>

/**
 * `name` e opcional - quando omitido, o `EditorService` usa o titulo da gravacao original como
 * padrao (mesma convencao de "nome derivado, editavel depois" ja usada em outros lugares do app).
 */
export const CreateEditProjectRequestSchema = z.object({
  projectId: IdSchema,
  name: z.string().min(1).max(200).optional()
})
export type CreateEditProjectRequest = z.infer<typeof CreateEditProjectRequestSchema>
export const CreateEditProjectResponseSchema = EditProjectResponseSchema

export const GetEditProjectRequestSchema = z.object({ id: IdSchema })
export type GetEditProjectRequest = z.infer<typeof GetEditProjectRequestSchema>
export const GetEditProjectResponseSchema = EditProjectResponseSchema

/** Lista TODOS os projetos de edicao (de qualquer gravacao) - a tela "/editor" e uma visao geral,
 * equivalente a Biblioteca para gravacoes. */
export const ListEditProjectsRequestSchema = EmptyRequestSchema
export const ListEditProjectsResponseSchema = z.array(EditProjectResponseSchema)
