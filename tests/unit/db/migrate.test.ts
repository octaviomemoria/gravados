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

  it('creates all 8 tables documented in 06_DATA_MODEL.md', () => {
    client = createTestDatabase()
    const rows = client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
    const names = rows.map((row) => row.name).filter((name) => name !== '__drizzle_migrations')

    expect(names.sort()).toEqual(
      [
        'edit_operations',
        'edit_projects',
        'export_jobs',
        'markers',
        'projects',
        'segments',
        'settings',
        'tracks'
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
        'idx_export_jobs_status'
      ].sort()
    )
  })

  it('is idempotent - running migrations twice against the same db does not throw', () => {
    client = createTestDatabase()
    expect(() => runMigrations(client!.db, MIGRATIONS_FOLDER)).not.toThrow()
  })
})
