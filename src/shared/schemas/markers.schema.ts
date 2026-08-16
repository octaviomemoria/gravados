import { z } from 'zod'
import { IdSchema } from './common.schema'

/**
 * RF-016 (oitavo incremento da Fase 1 - marcadores, REC-014). Espelha `MarkerEntity`
 * (`shared/types/entities.ts`)/06_DATA_MODEL.md - `title`/`note` sao opcionais no ato de criar
 * (`AddMarkerRequestSchema` em `recording.schema.ts`) mas sempre presentes na resposta (`null`
 * quando nao informados), mesma convencao ja usada por `ProjectResponseSchema.notes`.
 */
export const MarkerResponseSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  timestampMs: z.number().int().nonnegative(),
  title: z.string().nullable(),
  note: z.string().nullable()
})
export type MarkerResponse = z.infer<typeof MarkerResponseSchema>

/**
 * Canal de LEITURA (`markers.list`), fora do dominio `recording.*` deliberadamente - listar
 * marcadores de um projeto ja finalizado nao depende de nenhuma sessao de gravacao ativa
 * (diferente de `recording.addMarker`, que so faz sentido durante uma sessao em andamento).
 * Ordenado por `timestampMs` (ver `MarkerRepository.listByProject`), util tanto para verificacao
 * de teste quanto para uma futura tela de detalhes do projeto na Biblioteca.
 */
export const ListMarkersRequestSchema = z.object({ projectId: IdSchema })
export type ListMarkersRequest = z.infer<typeof ListMarkersRequestSchema>
export const ListMarkersResponseSchema = z.array(MarkerResponseSchema)

/**
 * Refinamento pós-LIB-PLAYER - resolve a pendência registrada "marcadores não têm edição/exclusão
 * depois de criados". Vive no mesmo domínio de `markers.list` (`markers.handlers.ts`), não em
 * `recording.*` - editar/excluir um marcador nunca depende de uma sessão de gravação ativa
 * (diferente de `recording.addMarker`), funciona tanto durante quanto muito depois da gravação
 * ter terminado. `title`/`note` aceitam `null` explícito (limpar o campo, distinto de "não
 * alterar" - `undefined`/campo ausente) - mesma convenção de "PATCH parcial" já usada por
 * `SetTrackGain`/`SetTrackFade` no editor, adaptada aqui pra dois campos opcionais em vez de
 * substituir o registro inteiro.
 */
export const UpdateMarkerRequestSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(200).nullable().optional(),
  note: z.string().min(1).max(2000).nullable().optional()
})
export type UpdateMarkerRequest = z.infer<typeof UpdateMarkerRequestSchema>
export const UpdateMarkerResponseSchema = MarkerResponseSchema

export const DeleteMarkerRequestSchema = z.object({ id: IdSchema })
export type DeleteMarkerRequest = z.infer<typeof DeleteMarkerRequestSchema>
export const DeleteMarkerResponseSchema = z.object({ deleted: z.boolean() })
