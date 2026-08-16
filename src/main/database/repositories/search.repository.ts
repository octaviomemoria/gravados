import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../client'

/** Marcadores de controle (nunca aparecem em texto real digitado/transcrito) que o FTS5
 * `snippet()` insere ao redor de cada termo que casou com a busca - `SearchService.parseSnippet`
 * os usa pra dividir o trecho em partes destacadas/normais sem nunca expor HTML bruto do banco
 * pro renderer (ver comentário completo em `search.service.ts`). */
export const SNIPPET_OPEN_MARKER = ''
export const SNIPPET_CLOSE_MARKER = ''
const SNIPPET_MAX_TOKENS = 32

// Gotcha do SQLite/FTS5: as funcoes auxiliares especiais (snippet(), highlight(), bm25())
// exigem o NOME REAL da tabela virtual como primeiro argumento, nunca o alias usado no
// FROM/JOIN (`fts` abaixo) - referenciar snippet(fts, ...) falha com `no such column: fts`,
// mesmo o WHERE ... MATCH e os JOINs em fts.rowid funcionando normalmente com o alias.
// Confirmado via reproducao isolada com better-sqlite3 puro antes de aplicar o fix.

/** Uma linha crua devolvida pela junção `transcript_segments_fts` → `transcript_segments` →
 * `transcripts` → `projects` - os nomes das colunas vêm exatamente dos aliases SQL abaixo (`AS`),
 * `better-sqlite3` devolve as chaves do jeito que a query pediu. */
export interface SearchHitRow {
  segmentId: string
  transcriptId: string
  projectId: string
  projectTitle: string
  startMs: number
  endMs: number
  speaker: string | null
  text: string
  /** Trecho recortado ao redor do primeiro trecho relevante (via `snippet()` do FTS5), com os
   * termos que casaram envolvidos por `SNIPPET_OPEN_MARKER`/`SNIPPET_CLOSE_MARKER`. */
  snippet: string
}

/**
 * SEARCH-001 (Fase 7 — Knowledge, "Full-text search local"). Único repositório deste app que faz
 * SQL bruto via `sql` (drizzle-orm) em vez do query builder - o Drizzle não modela tabelas
 * virtuais FTS5 nem o operador `MATCH`, então a junção `transcript_segments_fts` (índice) →
 * `transcript_segments` (texto/timestamps reais, via `rowid`) → `transcripts` (provider/model) →
 * `projects` (título, pra exibir no resultado) precisa ser escrita à mão. `ftsQuery` já vem
 * pronta (montada por `buildFtsMatchQuery`, `search.service.ts`) - este repositório nunca decide
 * sintaxe de busca, só executa.
 */
export class SearchRepository {
  constructor(private readonly db: AppDatabase) {}

  searchTranscriptSegments(
    ftsQuery: string,
    projectId: string | undefined,
    limit: number,
    offset: number
  ): SearchHitRow[] {
    const rows = projectId
      ? this.db.all(sql`
          SELECT
            ts.id AS segmentId,
            ts.transcript_id AS transcriptId,
            t.project_id AS projectId,
            p.title AS projectTitle,
            ts.start_ms AS startMs,
            ts.end_ms AS endMs,
            ts.speaker AS speaker,
            ts.text AS text,
            snippet(transcript_segments_fts, 0, ${SNIPPET_OPEN_MARKER}, ${SNIPPET_CLOSE_MARKER}, '...', ${SNIPPET_MAX_TOKENS}) AS snippet
          FROM transcript_segments_fts fts
          JOIN transcript_segments ts ON ts.rowid = fts.rowid
          JOIN transcripts t ON t.id = ts.transcript_id
          JOIN projects p ON p.id = t.project_id
          WHERE transcript_segments_fts MATCH ${ftsQuery} AND t.project_id = ${projectId}
          ORDER BY rank
          LIMIT ${limit} OFFSET ${offset}
        `)
      : this.db.all(sql`
          SELECT
            ts.id AS segmentId,
            ts.transcript_id AS transcriptId,
            t.project_id AS projectId,
            p.title AS projectTitle,
            ts.start_ms AS startMs,
            ts.end_ms AS endMs,
            ts.speaker AS speaker,
            ts.text AS text,
            snippet(transcript_segments_fts, 0, ${SNIPPET_OPEN_MARKER}, ${SNIPPET_CLOSE_MARKER}, '...', ${SNIPPET_MAX_TOKENS}) AS snippet
          FROM transcript_segments_fts fts
          JOIN transcript_segments ts ON ts.rowid = fts.rowid
          JOIN transcripts t ON t.id = ts.transcript_id
          JOIN projects p ON p.id = t.project_id
          WHERE transcript_segments_fts MATCH ${ftsQuery}
          ORDER BY rank
          LIMIT ${limit} OFFSET ${offset}
        `)
    return rows as SearchHitRow[]
  }

  /** Refinamento "paginação" - conta o total de segmentos que casam com o MESMO `MATCH` (sem
   * `LIMIT`/`OFFSET`), pra `SearchService` devolver `totalCount`/`hasMore` junto da página atual -
   * uma segunda consulta separada (não dá pra obter via `COUNT(*) OVER()` de forma simples com o
   * `better-sqlite3`/drizzle `sql` usados aqui), mas reusa o MESMO índice FTS5, custo desprezível. */
  countTranscriptSegments(ftsQuery: string, projectId: string | undefined): number {
    const row = projectId
      ? this.db.get<{ total: number }>(sql`
          SELECT COUNT(*) AS total
          FROM transcript_segments_fts fts
          JOIN transcript_segments ts ON ts.rowid = fts.rowid
          JOIN transcripts t ON t.id = ts.transcript_id
          WHERE transcript_segments_fts MATCH ${ftsQuery} AND t.project_id = ${projectId}
        `)
      : this.db.get<{ total: number }>(sql`
          SELECT COUNT(*) AS total
          FROM transcript_segments_fts fts
          JOIN transcript_segments ts ON ts.rowid = fts.rowid
          JOIN transcripts t ON t.id = ts.transcript_id
          WHERE transcript_segments_fts MATCH ${ftsQuery}
        `)
    return row.total
  }
}
