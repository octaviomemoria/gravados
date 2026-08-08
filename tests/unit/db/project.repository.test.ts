import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import { ProjectRepository } from '../../../src/main/database/repositories'
import type { DatabaseClient } from '../../../src/main/database/client'

describe('ProjectRepository', () => {
  let client: DatabaseClient
  let repository: ProjectRepository

  beforeEach(() => {
    client = createTestDatabase()
    repository = new ProjectRepository(client.db)
  })

  afterEach(() => {
    client.close()
  })

  it('creates and finds a project by id', () => {
    const id = randomUUID()
    repository.create({
      id,
      title: 'Reuniao de kickoff',
      createdAt: '2026-01-01T10:00:00.000Z',
      status: 'IDLE',
      rootPath: `/library/projects/${id}`
    })

    const found = repository.findById(id)
    expect(found?.title).toBe('Reuniao de kickoff')
    expect(found?.status).toBe('IDLE')
    expect(found?.startedAt).toBeNull()
  })

  it('returns undefined for a missing project', () => {
    expect(repository.findById(randomUUID())).toBeUndefined()
  })

  it('lists projects ordered by createdAt desc', () => {
    repository.create({
      id: randomUUID(),
      title: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'IDLE',
      rootPath: '/a'
    })
    repository.create({
      id: randomUUID(),
      title: 'B',
      createdAt: '2026-01-02T00:00:00.000Z',
      status: 'IDLE',
      rootPath: '/b'
    })

    expect(repository.list().map((project) => project.title)).toEqual(['B', 'A'])
  })

  it('updates the status', () => {
    const id = randomUUID()
    repository.create({
      id,
      title: 'X',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'IDLE',
      rootPath: '/x'
    })

    repository.updateStatus(id, 'RECORDING')

    expect(repository.findById(id)?.status).toBe('RECORDING')
  })

  it('deletes a project', () => {
    const id = randomUUID()
    repository.create({
      id,
      title: 'X',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'IDLE',
      rootPath: '/x'
    })

    repository.delete(id)

    expect(repository.findById(id)).toBeUndefined()
  })
})
