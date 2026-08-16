import { SNIPPET_OPEN_MARKER, SNIPPET_CLOSE_MARKER } from '../database/repositories/search.repository'
import type { SearchRepository, SearchHitRow } from '../database/repositories/search.repository'
import type { SearchHitResponse, SnippetPart } from '../../shared/schemas/search.schema'

const DEFAULT_LIMIT = 50

/**
 * SEARCH-001 (Fase 7 — Knowledge, "Full-text search local", `07_AI_TRANSCRIPTION_KNOWLEDGE.md`
 * §10 Fase 1). Traduz uma busca digitada pelo usuário (texto livre, potencialmente com aspas/
 * operadores que o FTS5 interpretaria como sintaxe própria) numa query FTS5 SEGURA - cada token
 * vira uma frase literal entre aspas com prefixo (`"token"*`), nunca repassando o texto do
 * usuário cru pro `MATCH`. Isso tem dois efeitos: (1) previne um erro de sintaxe FTS5 se o
 * usuário digitar algo como `"` sozinho ou operadores como `AND`/`NOT`/`NEAR` sem querer usá-los
 * como tal; (2) dá um comportamento de "prefixo" natural (digitar "reuni" já casa "reunião").
 * Múltiplos tokens são unidos com espaço - o operador booleano PADRÃO do FTS5 entre termos é AND,
 * então buscar "prazo entrega" exige as duas frases presentes no mesmo segmento.
 *
 * Retorna `null` (não lança, não retorna array vazio) pra uma busca vazia/só espaços - o
 * CHAMADOR (`SearchService.searchTranscripts`) decide que uma busca vazia não gera nenhuma
 * consulta ao banco, nem sequer uma vazia.
 */
export function buildFtsMatchQuery(rawQuery: string): string | null {
  const tokens = rawQuery.trim().split(/\s+/).filter((token) => token.length > 0)
  if (tokens.length === 0) return null
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' ')
}

/**
 * Divide o trecho recortado pelo `snippet()` do FTS5 (que já vem com os termos que casaram
 * envolvidos por `SNIPPET_OPEN_MARKER`/`SNIPPET_CLOSE_MARKER`, ver `search.repository.ts`) em
 * partes alternadas destacadas/normais - NUNCA expõe HTML bruto pro renderer (sem
 * `dangerouslySetInnerHTML` em lugar nenhum), só um array de `{ text, highlighted }` que a UI
 * decide como desenhar (ex.: `<mark>`). Função pura, testável isoladamente sem precisar de um
 * banco real.
 */
export function parseSnippet(rawSnippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let cursor = 0
  while (cursor < rawSnippet.length) {
    const openIndex = rawSnippet.indexOf(SNIPPET_OPEN_MARKER, cursor)
    if (openIndex === -1) {
      parts.push({ text: rawSnippet.slice(cursor), highlighted: false })
      break
    }
    if (openIndex > cursor) {
      parts.push({ text: rawSnippet.slice(cursor, openIndex), highlighted: false })
    }
    const closeIndex = rawSnippet.indexOf(SNIPPET_CLOSE_MARKER, openIndex + 1)
    if (closeIndex === -1) {
      // Marcador de abertura sem fechamento correspondente (nao deveria acontecer com o
      // `snippet()` real do FTS5, mas defensivamente tratado como texto normal em vez de travar).
      parts.push({ text: rawSnippet.slice(openIndex + 1), highlighted: false })
      break
    }
    parts.push({ text: rawSnippet.slice(openIndex + 1, closeIndex), highlighted: true })
    cursor = closeIndex + 1
  }
  return parts
}

function toSearchHitResponse(row: SearchHitRow): SearchHitResponse {
  return {
    segmentId: row.segmentId,
    transcriptId: row.transcriptId,
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    startMs: row.startMs,
    endMs: row.endMs,
    speaker: row.speaker,
    text: row.text,
    snippetParts: parseSnippet(row.snippet)
  }
}

/**
 * SEARCH-001 - busca full-text 100% LOCAL sobre `transcript_segments` (via a tabela virtual FTS5
 * `transcript_segments_fts`, ver `0003_search_fts.sql`) - nenhuma chamada de rede, nenhum custo,
 * nenhuma implicação de privacidade (diferente de SEARCH-002/003/004 no roadmap, que dependem de
 * embeddings via provedor externo - a mesma linha divisória já registrada em AI-001/AI-002).
 * Funciona hoje mesmo sem nenhum transcript real existir ainda (AI-002 ainda não implementado) -
 * so devolve uma lista vazia até lá, exatamente como qualquer busca sem resultado.
 */
export class SearchService {
  constructor(private readonly searchRepository: SearchRepository) {}

  searchTranscripts(query: string, projectId?: string): SearchHitResponse[] {
    const ftsQuery = buildFtsMatchQuery(query)
    if (!ftsQuery) return []
    return this.searchRepository
      .searchTranscriptSegments(ftsQuery, projectId, DEFAULT_LIMIT)
      .map(toSearchHitResponse)
  }
}
