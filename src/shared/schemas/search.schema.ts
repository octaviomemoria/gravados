import { z } from 'zod'
import { IdSchema } from './common.schema'

/**
 * SEARCH-001 (Fase 7 — Knowledge, "Full-text search local", trigésimo terceiro incremento).
 * `projectId` opcional restringe a busca a UM projeto (usado pela Biblioteca, incremento futuro);
 * omitido busca em TODAS as reuniões - o caso de uso principal descrito em
 * `01_PRODUCT_VISION_PRD.md` ("memória corporativa pesquisável").
 */
/** `offset` (refinamento pós-SEARCH-002-refine, "paginação") pagina os resultados JÁ ordenados por
 * `rank` (relevância nativa do FTS5) - nunca reordena nem afeta o `MATCH`, só desloca a janela
 * `LIMIT`/`OFFSET` da consulta. Omitido = primeira página (equivalente a `0`). */
export const SearchTranscriptsRequestSchema = z.object({
  query: z.string().min(1).max(200),
  projectId: IdSchema.optional(),
  offset: z.number().int().nonnegative().default(0)
})
export type SearchTranscriptsRequest = z.infer<typeof SearchTranscriptsRequestSchema>

/** Refinamento pós-SEARCH-001: trecho recortado (via `snippet()` do FTS5) dividido em partes
 * alternadas destacadas/normais - nunca HTML bruto, só dado estruturado que a UI decide como
 * desenhar (`<mark>` pra `highlighted: true`). Ver `SearchService.parseSnippet`. */
export const SnippetPartSchema = z.object({
  text: z.string(),
  highlighted: z.boolean()
})
export type SnippetPart = z.infer<typeof SnippetPartSchema>

export const SearchHitResponseSchema = z.object({
  segmentId: IdSchema,
  transcriptId: IdSchema,
  projectId: IdSchema,
  projectTitle: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  speaker: z.string().nullable(),
  text: z.string(),
  snippetParts: z.array(SnippetPartSchema)
})
export type SearchHitResponse = z.infer<typeof SearchHitResponseSchema>

/** Refinamento "paginação" - `totalCount` é o total de segmentos que casaram com a busca (não só
 * os desta página), calculado por uma consulta `COUNT(*)` separada (`SearchRepository`) sobre o
 * MESMO `MATCH`, sempre executada (o custo extra é desprezível pro FTS5 - já usa o mesmo índice).
 * `hasMore` evita a UI precisar recalcular `offset + hits.length < totalCount` sozinha. */
export const SearchTranscriptsResponseSchema = z.object({
  hits: z.array(SearchHitResponseSchema),
  totalCount: z.number().int().nonnegative(),
  hasMore: z.boolean()
})
export type SearchTranscriptsResponse = z.infer<typeof SearchTranscriptsResponseSchema>
