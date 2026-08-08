import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../../fixtures/tmp-db'
import { SettingsRepository } from '../../../src/main/database/repositories'
import type { DatabaseClient } from '../../../src/main/database/client'

describe('SettingsRepository', () => {
  let client: DatabaseClient
  let repository: SettingsRepository

  beforeEach(() => {
    client = createTestDatabase()
    repository = new SettingsRepository(client.db)
  })

  afterEach(() => {
    client.close()
  })

  it('returns undefined for a key that was never set', () => {
    expect(repository.get('app')).toBeUndefined()
  })

  it('round-trips a JSON value', () => {
    repository.set('app', { theme: 'dark', defaultLibraryRootPath: '/x' }, '2026-01-01T00:00:00.000Z')
    expect(repository.get('app')).toEqual({ theme: 'dark', defaultLibraryRootPath: '/x' })
  })

  it('overwrites an existing key on conflict (upsert)', () => {
    repository.set('app', { theme: 'light', defaultLibraryRootPath: '/x' }, '2026-01-01T00:00:00.000Z')
    repository.set('app', { theme: 'dark', defaultLibraryRootPath: '/x' }, '2026-01-02T00:00:00.000Z')

    expect(repository.get('app')).toEqual({ theme: 'dark', defaultLibraryRootPath: '/x' })
  })
})
