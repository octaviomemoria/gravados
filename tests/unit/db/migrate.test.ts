import { describe, it, expect, afterEach } from 'vitest'
import { createTestDatabase, MIGRATIONS_FOLDER } from '../../fixtures/tmp-db'
import type { DatabaseClient } from '../../../src/main/database/client'
import { runMigrations } from '../../../src/main/database/migrate'

describe('migrations', () => {
  let client: DatabaseClient | undefined

  afterEach(() => {
    client?.close()
    client = undefined
  })

  it('creates all 11 tabelas de dominio documentadas em 06_DATA_MODEL.md (8 originais + 3 de AI-001, Fase 5)', () => {
    client = createTestDatabase()
    const rows = client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
    const names = rows.map((row) => row.name).filter((name) => name !== '__drizzle_migrations')

    // SEARCH-001 - `transcript_segments_fts` (tabela virtual FTS5, escrita a mao em
    // `0003_search_fts.sql`, nunca modelada em `schema/*.ts`) mais suas 4 tabelas-sombra internas
    // (`_config`/`_data`/`_docsize`/`_idx`, geradas automaticamente pelo proprio SQLite pra
    // qualquer FTS5 de "conteudo externo") - nao sao "tabelas de dominio", mas aparecem aqui como
    // qualquer tabela real.
    expect(names.sort()).toEqual(
      [
        'edit_operations',
        'edit_projects',
        'export_jobs',
        'markers',
        'projects',
        'segments',
        'settings',
        'tracks',
        'transcript_segments',
        'transcript_segments_fts',
        'transcript_segments_fts_config',
        'transcript_segments_fts_data',
        'transcript_segments_fts_docsize',
        'transcript_segments_fts_idx',
        'transcription_jobs',
        'transcripts'
      ].sort()
    )
  })

  it('enables foreign key enforcement (required for ON DELETE CASCADE/SET NULL)', () => {
    client = createTestDatabase()
    expect(client.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('creates the documented indexes', () => {
    client = createTestDatabase()
    const rows = client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names.sort()).toEqual(
      [
        'idx_projects_created_at',
        'idx_projects_status',
        'idx_tracks_project_id',
        'idx_segments_track_seq',
        'idx_markers_project_timestamp',
        'idx_edit_projects_project_id',
        'idx_edit_operations_project_sequence',
        'idx_export_jobs_status',
        'idx_transcription_jobs_project',
        'idx_transcripts_project',
        'idx_transcript_segments_transcript_start'
      ].sort()
    )
  })

  it('is idempotent - running migrations twice against the same db does not throw', () => {
    client = createTestDatabase()
    expect(() => runMigrations(client!.db, MIGRATIONS_FOLDER)).not.toThrow()
  })

  it('SEARCH-001: creates the three sync triggers that keep transcript_segments_fts in sync', () => {
    client = createTestDatabase()
    const rows = client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(rows.map((row) => row.name)).toEqual([
      'transcript_segments_ad',
      'transcript_segments_ai',
      'transcript_segments_au'
    ])
  })
})
