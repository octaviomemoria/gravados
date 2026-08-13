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
