import { z } from 'zod'
import { TRACK_TYPES } from '../types/entities'
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

/**
 * EDIT-002 (decimo terceiro incremento - Fase 3, timeline). Um "clip" nesta etapa e sempre 1:1
 * com um segmento gravado (nenhuma operacao de edicao - trim/split/remove - ainda existe, ver
 * `edit_operations`, tabela ja existente mas sem consumidor ate um incremento futuro). `startMs`/
 * `endMs` sao relativos ao INICIO DA SESSAO DE GRAVACAO (`project.startedAt`), nao ao inicio do
 * segmento em si - a mesma posicao 0-based usada pelo cronometro/marcadores durante a gravacao
 * (ver `RecordingControls`/decisao sobre `timestampMs` de marcadores), reaproveitada aqui como o
 * eixo de tempo canonico da timeline de edicao.
 */
export const TimelineClipSchema = z.object({
  segmentId: IdSchema,
  seqIndex: z.number().int().positive(),
  relativePath: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  /**
   * EDIT-004/005/006 (decimo setimo incremento - corte/split/remover intervalo). Offset (ms)
   * DENTRO DO ARQUIVO de origem onde o conteudo deste clip comeca - sempre `0` na timeline BRUTA
   * (`EditorService.getTimeline`, um segmento sempre usado do seu proprio inicio), mas pode ser
   * maior que zero na timeline EDITADA (`getEditedTimeline`) quando um `REMOVE_RANGE` corta o
   * INICIO de um clip: a parte que sobra ainda referencia o mesmo `relativePath`, so comecando
   * mais adiante dentro do arquivo. Necessario porque o player (`useMultiTrackPlayback`) precisa
   * saber ONDE no arquivo buscar, nao so por quanto tempo tocar.
   */
  sourceStartMs: z.number().int().nonnegative(),
  byteSize: z.number().int().nonnegative()
})
export type TimelineClip = z.infer<typeof TimelineClipSchema>

export const TimelineTrackSchema = z.object({
  id: IdSchema,
  type: z.enum(TRACK_TYPES),
  clips: z.array(TimelineClipSchema)
})
export type TimelineTrack = z.infer<typeof TimelineTrackSchema>

export const GetTimelineRequestSchema = z.object({ editProjectId: IdSchema })
export type GetTimelineRequest = z.infer<typeof GetTimelineRequestSchema>
export const GetTimelineResponseSchema = z.object({
  editProjectId: IdSchema,
  projectId: IdSchema,
  totalDurationMs: z.number().int().nonnegative(),
  tracks: z.array(TimelineTrackSchema)
})
export type GetTimelineResponse = z.infer<typeof GetTimelineResponseSchema>

/**
 * EDIT-004/005/006 (decimo setimo incremento - Fase 3, primeira operacao de edicao real). A
 * timeline EDITADA - a bruta (`getTimeline`) com o LOG ordenado de `edit_operations` ja aplicado
 * por cima (hoje so `REMOVE_RANGE` existe; tipos futuros - gain/fade/camera transform, EDIT-008
 * em diante - sao ignorados pelo compilador sem quebrar, ate ganharem seu proprio incremento).
 * Mesmo formato de resposta que `getTimeline` - o consumidor (preview/timeline na UI) nao
 * precisa distinguir "bruta" de "editada", so troca qual canal chama.
 */
export const GetEditedTimelineRequestSchema = GetTimelineRequestSchema
export type GetEditedTimelineRequest = GetTimelineRequest
export const GetEditedTimelineResponseSchema = GetTimelineResponseSchema
export type GetEditedTimelineResponse = GetTimelineResponse

/**
 * Corte/split/remover-intervalo (Trim/Split/Delete range de `05_MEDIA_EDITOR.md` §4) sao todos o
 * MESMO primitivo aqui: um `REMOVE_RANGE` que apaga `[startMs, endMs)` de TODAS as trilhas
 * simultaneamente e desloca tudo depois para a esquerda. "Trim inicio" = `REMOVE_RANGE(0, X)`;
 * "trim fim" = `REMOVE_RANGE(X, totalDurationMs)`; "split + apagar o meio" = uma selecao
 * arbitraria no meio da timeline - a UI so oferece atalhos diferentes para o mesmo IPC. `startMs`/
 * `endMs` sao relativos a timeline EDITADA ATUAL (apos as operacoes anteriores ja aplicadas), nao
 * a timeline bruta original - o mesmo referencial que o usuario ve na tela no momento do corte.
 */
export const RemoveRangeRequestSchema = z
  .object({
    editProjectId: IdSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive()
  })
  .refine((value) => value.startMs < value.endMs, {
    message: 'startMs deve ser menor que endMs'
  })
export type RemoveRangeRequest = z.infer<typeof RemoveRangeRequestSchema>
/** Retorna a timeline editada RECEM-RECALCULADA - poupa o chamador de um segundo round-trip. */
export const RemoveRangeResponseSchema = GetTimelineResponseSchema
export type RemoveRangeResponse = GetTimelineResponse
