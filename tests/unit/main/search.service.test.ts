import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import {
  ProjectRepository,
  TranscriptRepository,
  SearchRepository,
  SNIPPET_OPEN_MARKER,
  SNIPPET_CLOSE_MARKER
} from '../../../src/main/database/repositories'
import { buildTranscriptEntities } from '../../../src/main/services/transcription.service'
import { SearchService, buildFtsMatchQuery, parseSnippet } from '../../../src/main/services/search.service'
import type { DatabaseClient } from '../../../src/main/database/client'

/**
 * SEARCH-001 (trigesimo terceiro incremento - Fase 7 "Knowledge"). Semeia transcricoes/segmentos
 * diretamente via `TranscriptRepository.createWithSegments` (mesma tecnica ja usada em
 * `transcription.service.test.ts` pra `getTranscript`) - nenhum caminho IPC ainda cria transcritos
 * reais nesta fase (AI-002 nao implementada), entao esta e a UNICA forma de popular
 * `transcript_segments`/`transcript_segments_fts` num teste.
 */
describe('buildFtsMatchQuery', () => {
  it('returns null for an empty or whitespace-only query', () => {
    expect(buildFtsMatchQuery('')).toBeNull()
    expect(buildFtsMatchQuery('   ')).toBeNull()
  })

  it('wraps a single token as a quoted prefix phrase', () => {
    expect(buildFtsMatchQuery('prazo')).toBe('"prazo"*')
  })

  it('wraps multiple whitespace-separated tokens individually, joined by a space (implicit AND)', () => {
    expect(buildFtsMatchQuery('prazo  entrega')).toBe('"prazo"* "entrega"*')
  })

  it('escapes embedded double quotes by doubling them, preventing FTS5 syntax errors', () => {
    expect(buildFtsMatchQuery('diz "ola"')).toBe('"diz"* "\u0022\u0022ola\u0022\u0022"*')
  })

  it('never lets FTS5 boolean operator keywords be interpreted as operators (quoted as literal text)', () => {
    expect(buildFtsMatchQuery('AND NOT')).toBe('"AND"* "NOT"*')
  })
})

describe('parseSnippet', () => {
  it('returns a single non-highlighted part when there is no marker at all', () => {
    expect(parseSnippet('texto sem nenhum destaque')).toEqual([
      { text: 'texto sem nenhum destaque', highlighted: false }
    ])
  })

  it('splits a snippet with one highlighted term into three parts', () => {
    const raw = `antes ${SNIPPET_OPEN_MARKER}prazo${SNIPPET_CLOSE_MARKER} depois`
    expect(parseSnippet(raw)).toEqual([
      { text: 'antes ', highlighted: false },
      { text: 'prazo', highlighted: true },
      { text: ' depois', highlighted: false }
    ])
  })

  it('handles multiple highlighted terms in the same snippet', () => {
    const raw = `${SNIPPET_OPEN_MARKER}prazo${SNIPPET_CLOSE_MARKER} de ${SNIPPET_OPEN_MARKER}entrega${SNIPPET_CLOSE_MARKER}`
    expect(parseSnippet(raw)).toEqual([
      { text: 'prazo', highlighted: true },
      { text: ' de ', highlighted: false },
      { text: 'entrega', highlighted: true }
    ])
  })

  it('treats an empty string as a single empty non-highlighted part (no parts at all)', () => {
    expect(parseSnippet('')).toEqual([])
  })

  it('never throws on an unbalanced open marker without a matching close marker', () => {
    const raw = `texto ${SNIPPET_OPEN_MARKER}sem fechamento`
    expect(() => parseSnippet(raw)).not.toThrow()
    expect(parseSnippet(raw)).toEqual([
      { text: 'texto ', highlighted: false },
      { text: 'sem fechamento', highlighted: false }
    ])
  })
})

describe('SearchService', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let transcriptRepository: TranscriptRepository
  let searchService: SearchService

  beforeEach(() => {
    client = createTestDatabase()
    projectRepository = new ProjectRepository(client.db)
    transcriptRepository = new TranscriptRepository(client.db)
    searchService = new SearchService(new SearchRepository(client.db))
  })

  afterEach(() => {
    client.close()
  })

  function createProject(title: string): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title,
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
      rootPath: `C:\\fake\\${id}`
    })
    return { id }
  }

  function seedTranscript(
    projectId: string,
    segments: Array<{ startMs: number; endMs: number; text: string; speaker?: string }>
  ): void {
    const { transcript, segments: entities } = buildTranscriptEntities(projectId, 'OPENAI', {
      model: 'whisper-1',
      language: 'pt',
      segments
    })
    transcriptRepository.createWithSegments(transcript, entities)
  }

  it('returns an empty hits array (and totalCount 0) for an empty query, without touching the database', () => {
    expect(searchService.searchTranscripts('   ')).toEqual({ hits: [], totalCount: 0, hasMore: false })
  })

  it('returns an empty hits array when there are no transcripts at all', () => {
    expect(searchService.searchTranscripts('reuniao')).toEqual({ hits: [], totalCount: 0, hasMore: false })
  })

  it('finds a segment by an exact word match', () => {
    const project = createProject('Reuniao de sprint')
    seedTranscript(project.id, [{ startMs: 0, endMs: 1000, text: 'vamos revisar o prazo de entrega' }])

    const { hits, totalCount, hasMore } = searchService.searchTranscripts('prazo')
    expect(hits).toHaveLength(1)
    expect(totalCount).toBe(1)
    expect(hasMore).toBe(false)
    expect(hits[0]!.text).toBe('vamos revisar o prazo de entrega')
    expect(hits[0]!.projectId).toBe(project.id)
    expect(hits[0]!.projectTitle).toBe('Reuniao de sprint')

    // snippetParts vem do snippet() real do FTS5 (nao um mock) - confirma que o termo buscado
    // chega marcado como `highlighted: true`, e o resto do trecho como texto normal.
    const highlighted = hits[0]!.snippetParts.filter((part) => part.highlighted)
    expect(highlighted.map((part) => part.text.toLowerCase())).toEqual(['prazo'])
    const fullSnippetText = hits[0]!.snippetParts.map((part) => part.text).join('')
    expect(fullSnippetText).toBe('vamos revisar o prazo de entrega')
  })

  it('matches by prefix (typing "reuni" matches "reuniao")', () => {
    const project = createProject('Projeto X')
    seedTranscript(project.id, [{ startMs: 0, endMs: 1000, text: 'essa reuniao foi produtiva' }])

    const { hits } = searchService.searchTranscripts('reuni')
    expect(hits).toHaveLength(1)
  })

  it('requires every token to be present (implicit AND across multiple words)', () => {
    const project = createProject('Projeto Y')
    seedTranscript(project.id, [
      { startMs: 0, endMs: 1000, text: 'o prazo de entrega e sexta' },
      { startMs: 1000, endMs: 2000, text: 'a entrega sera feita por email' }
    ])

    const bothWords = searchService.searchTranscripts('prazo entrega')
    expect(bothWords.hits).toHaveLength(1)
    expect(bothWords.hits[0]!.text).toContain('prazo')

    const onlyOneWord = searchService.searchTranscripts('email')
    expect(onlyOneWord.hits).toHaveLength(1)
  })

  it('never breaks on a query containing quotes or FTS5 operator keywords', () => {
    const project = createProject('Projeto Z')
    seedTranscript(project.id, [{ startMs: 0, endMs: 1000, text: 'ele disse "ok" e confirmou' }])

    expect(() => searchService.searchTranscripts('"ok" AND NOT xyz')).not.toThrow()
  })

  it('restricts results (and totalCount) to the given projectId when provided', () => {
    const projectA = createProject('A')
    const projectB = createProject('B')
    seedTranscript(projectA.id, [{ startMs: 0, endMs: 1000, text: 'orcamento aprovado' }])
    seedTranscript(projectB.id, [{ startMs: 0, endMs: 1000, text: 'orcamento rejeitado' }])

    const scoped = searchService.searchTranscripts('orcamento', projectA.id)
    expect(scoped.hits).toHaveLength(1)
    expect(scoped.totalCount).toBe(1)
    expect(scoped.hits[0]!.projectId).toBe(projectA.id)

    const unscoped = searchService.searchTranscripts('orcamento')
    expect(unscoped.hits).toHaveLength(2)
    expect(unscoped.totalCount).toBe(2)
  })

  it('includes speaker when present and null when absent', () => {
    const project = createProject('Projeto W')
    seedTranscript(project.id, [
      { startMs: 0, endMs: 1000, text: 'ola time', speaker: 'Ana' },
      { startMs: 1000, endMs: 2000, text: 'ola pessoal' }
    ])

    const hits = [...searchService.searchTranscripts('ola').hits].sort((a, b) => a.startMs - b.startMs)
    expect(hits[0]!.speaker).toBe('Ana')
    expect(hits[1]!.speaker).toBeNull()
  })

  it('SearchService.totalCount/hasMore stay correct at an offset beyond the end of the results', () => {
    const project = createProject('Projeto Paginacao')
    seedTranscript(project.id, [
      { startMs: 0, endMs: 1000, text: 'pauta um' },
      { startMs: 1000, endMs: 2000, text: 'pauta dois' },
      { startMs: 2000, endMs: 3000, text: 'pauta tres' }
    ])

    const firstCall = searchService.searchTranscripts('pauta', undefined, 0)
    expect(firstCall.totalCount).toBe(3)
    expect(firstCall.hits).toHaveLength(3) // DEFAULT_LIMIT (50) nunca corta so 3 resultados
    expect(firstCall.hasMore).toBe(false)

    // Offset alem do total - hits vazio, hasMore sempre false, totalCount continua correto.
    const beyondEnd = searchService.searchTranscripts('pauta', undefined, 10)
    expect(beyondEnd.hits).toHaveLength(0)
    expect(beyondEnd.totalCount).toBe(3)
    expect(beyondEnd.hasMore).toBe(false)
  })
})

describe('SearchRepository pagination (LIMIT/OFFSET/COUNT direct)', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let transcriptRepository: TranscriptRepository
  let searchRepository: SearchRepository

  beforeEach(() => {
    client = createTestDatabase()
    projectRepository = new ProjectRepository(client.db)
    transcriptRepository = new TranscriptRepository(client.db)
    searchRepository = new SearchRepository(client.db)
  })

  afterEach(() => {
    client.close()
  })

  it('LIMIT/OFFSET returns the correct slice, and countTranscriptSegments matches the true total (unaffected by LIMIT/OFFSET)', () => {
    const projectId = randomUUID()
    projectRepository.create({
      id: projectId,
      title: 'Projeto Paginacao Direta',
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
      rootPath: `C:\\fake\\${projectId}`
    })
    const { transcript, segments } = buildTranscriptEntities(projectId, 'OPENAI', {
      model: 'whisper-1',
      language: 'pt',
      segments: [
        { startMs: 0, endMs: 1000, text: 'item um' },
        { startMs: 1000, endMs: 2000, text: 'item dois' },
        { startMs: 2000, endMs: 3000, text: 'item tres' }
      ]
    })
    transcriptRepository.createWithSegments(transcript, segments)

    expect(searchRepository.countTranscriptSegments('"item"*', undefined)).toBe(3)

    const firstPage = searchRepository.searchTranscriptSegments('"item"*', undefined, 2, 0)
    expect(firstPage).toHaveLength(2)

    const secondPage = searchRepository.searchTranscriptSegments('"item"*', undefined, 2, 2)
    expect(secondPage).toHaveLength(1)

    // As duas paginas juntas cobrem os 3 segmentos, sem repeticao.
    const allIds = [...firstPage, ...secondPage].map((row) => row.segmentId)
    expect(new Set(allIds).size).toBe(3)
  })
})
