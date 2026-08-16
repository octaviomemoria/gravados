import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import { ProjectRepository, TranscriptRepository, SearchRepository } from '../../../src/main/database/repositories'
import { buildTranscriptEntities } from '../../../src/main/services/transcription.service'
import { SearchService, buildFtsMatchQuery } from '../../../src/main/services/search.service'
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

  it('returns an empty array for an empty query, without touching the database', () => {
    expect(searchService.searchTranscripts('   ')).toEqual([])
  })

  it('returns an empty array when there are no transcripts at all', () => {
    expect(searchService.searchTranscripts('reuniao')).toEqual([])
  })

  it('finds a segment by an exact word match', () => {
    const project = createProject('Reuniao de sprint')
    seedTranscript(project.id, [{ startMs: 0, endMs: 1000, text: 'vamos revisar o prazo de entrega' }])

    const hits = searchService.searchTranscripts('prazo')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.text).toBe('vamos revisar o prazo de entrega')
    expect(hits[0]!.projectId).toBe(project.id)
    expect(hits[0]!.projectTitle).toBe('Reuniao de sprint')
  })

  it('matches by prefix (typing "reuni" matches "reuniao")', () => {
    const project = createProject('Projeto X')
    seedTranscript(project.id, [{ startMs: 0, endMs: 1000, text: 'essa reuniao foi produtiva' }])

    const hits = searchService.searchTranscripts('reuni')
    expect(hits).toHaveLength(1)
  })

  it('requires every token to be present (implicit AND across multiple words)', () => {
    const project = createProject('Projeto Y')
    seedTranscript(project.id, [
      { startMs: 0, endMs: 1000, text: 'o prazo de entrega e sexta' },
      { startMs: 1000, endMs: 2000, text: 'a entrega sera feita por email' }
    ])

    const bothWords = searchService.searchTranscripts('prazo entrega')
    expect(bothWords).toHaveLength(1)
    expect(bothWords[0]!.text).toContain('prazo')

    const onlyOneWord = searchService.searchTranscripts('email')
    expect(onlyOneWord).toHaveLength(1)
  })

  it('never breaks on a query containing quotes or FTS5 operator keywords', () => {
    const project = createProject('Projeto Z')
    seedTranscript(project.id, [{ startMs: 0, endMs: 1000, text: 'ele disse "ok" e confirmou' }])

    expect(() => searchService.searchTranscripts('"ok" AND NOT xyz')).not.toThrow()
  })

  it('restricts results to the given projectId when provided', () => {
    const projectA = createProject('A')
    const projectB = createProject('B')
    seedTranscript(projectA.id, [{ startMs: 0, endMs: 1000, text: 'orcamento aprovado' }])
    seedTranscript(projectB.id, [{ startMs: 0, endMs: 1000, text: 'orcamento rejeitado' }])

    const scoped = searchService.searchTranscripts('orcamento', projectA.id)
    expect(scoped).toHaveLength(1)
    expect(scoped[0]!.projectId).toBe(projectA.id)

    const unscoped = searchService.searchTranscripts('orcamento')
    expect(unscoped).toHaveLength(2)
  })

  it('includes speaker when present and null when absent', () => {
    const project = createProject('Projeto W')
    seedTranscript(project.id, [
      { startMs: 0, endMs: 1000, text: 'ola time', speaker: 'Ana' },
      { startMs: 1000, endMs: 2000, text: 'ola pessoal' }
    ])

    const hits = searchService.searchTranscripts('ola').sort((a, b) => a.startMs - b.startMs)
    expect(hits[0]!.speaker).toBe('Ana')
    expect(hits[1]!.speaker).toBeNull()
  })
})
