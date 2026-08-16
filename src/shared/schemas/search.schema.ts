import { z } from 'zod'
import { IdSchema } from './common.schema'

/**
 * SEARCH-001 (Fase 7 — Knowledge, "Full-text search local", trigésimo terceiro incremento).
 * `projectId` opcional restringe a busca a UM projeto (usado pela Biblioteca, incremento futuro);
 * omitido busca em TODAS as reuniões - o caso de uso principal descrito em
 * `01_PRODUCT_VISION_PRD.md` ("memória corporativa pesquisável").
 */
export const SearchTranscriptsRequestSchema = z.object({
  query: z.string().min(1).max(200),
  projectId: IdSchema.optional()
})
export type SearchTranscriptsRequest = z.infer<typeof SearchTranscriptsRequestSchema>

export const SearchHitResponseSchema = z.object({
  segmentId: IdSchema,
  transcriptId: IdSchema,
  projectId: IdSchema,
  projectTitle: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  speaker: z.string().nullable(),
  text: z.string()
})
export type SearchHitResponse = z.infer<typeof SearchHitResponseSchema>

export const SearchTranscriptsResponseSchema = z.array(SearchHitResponseSchema)
