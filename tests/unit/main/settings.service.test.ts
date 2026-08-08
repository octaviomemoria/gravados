import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../../fixtures/tmp-db'
import { SettingsRepository } from '../../../src/main/database/repositories'
import { SettingsService, buildDefaultSettings } from '../../../src/main/services/settings.service'
import type { DatabaseClient } from '../../../src/main/database/client'

describe('SettingsService', () => {
  let client: DatabaseClient
  let service: SettingsService

  beforeEach(() => {
    client = createTestDatabase()
    const repository = new SettingsRepository(client.db)
    service = new SettingsService(repository, buildDefaultSettings('/library'))
  })

  afterEach(() => {
    client.close()
  })

  it('returns defaults when nothing was persisted yet', () => {
    expect(service.get('app')).toEqual({ theme: 'system', defaultLibraryRootPath: '/library' })
  })

  it('persists and returns an updated value', () => {
    const updated = service.update(
      'app',
      { theme: 'dark', defaultLibraryRootPath: '/library' },
      '2026-01-01T00:00:00.000Z'
    )
    expect(updated.theme).toBe('dark')
    expect(service.get('app').theme).toBe('dark')
  })

  it('rejects an invalid update payload', () => {
    expect(() =>
      service.update('app', { theme: 'not-a-theme' }, '2026-01-01T00:00:00.000Z')
    ).toThrow()
  })

  it('falls back to defaults when the persisted value is corrupted', () => {
    // Grava um valor invalido diretamente, contornando a validacao do service.
    const repository = new SettingsRepository(client.db)
    repository.set('recordingPresets', { garbage: true }, '2026-01-01T00:00:00.000Z')

    expect(service.get('recordingPresets').qualityPreset).toBe('STANDARD')
  })
})
