import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import {
  ProjectRepository,
  EditProjectRepository,
  ExportJobRepository
} from '../../../src/main/database/repositories'
import type { DatabaseClient } from '../../../src/main/database/client'

describe('ExportJobRepository', () => {
  let client: DatabaseClient
  let repository: ExportJobRepository
  let editProjectId: string

  beforeEach(() => {
    client = createTestDatabase()
    const projectRepository = new ProjectRepository(client.db)
    const editProjectRepository = new EditProjectRepository(client.db)
    repository = new ExportJobRepository(client.db)

    const projectId = randomUUID()
    projectRepository.create({
      id: projectId,
      title: 'Projeto',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'IDLE',
      rootPath: '/x'
    })

    editProjectId = randomUUID()
    editProjectRepository.create({
      id: editProjectId,
      projectId,
      name: 'Edicao',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 1,
      activeOperationSequence: 0
    })
  })

  afterEach(() => {
    client.close()
  })

  it('creates a job and finds it by id', () => {
    const id = randomUUID()
    repository.create({
      id,
      editProjectId,
      status: 'QUEUED',
      progress: 0,
      outputPath: null,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null
    })

    expect(repository.findById(id)?.status).toBe('QUEUED')
  })

  it('completes a job', () => {
    const id = randomUUID()
    repository.create({
      id,
      editProjectId,
      status: 'RUNNING',
      progress: 50,
      outputPath: null,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null
    })

    repository.complete(id, '/exports/out.mp4', '2026-01-01T00:05:00.000Z')

    const job = repository.findById(id)
    expect(job?.status).toBe('COMPLETED')
    expect(job?.progress).toBe(100)
    expect(job?.outputPath).toBe('/exports/out.mp4')
  })

  it('fails a job', () => {
    const id = randomUUID()
    repository.create({
      id,
      editProjectId,
      status: 'RUNNING',
      progress: 10,
      outputPath: null,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null
    })

    repository.fail(id, 'disco cheio', '2026-01-01T00:01:00.000Z')

    const job = repository.findById(id)
    expect(job?.status).toBe('FAILED')
    expect(job?.error).toBe('disco cheio')
  })

  it('cancels a job (EXP-003/004 - completedAt precisa ser gravado tambem no cancelamento)', () => {
    const id = randomUUID()
    repository.create({
      id,
      editProjectId,
      status: 'RUNNING',
      progress: 30,
      outputPath: null,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null
    })

    repository.cancel(id, '2026-01-01T00:02:00.000Z')

    const job = repository.findById(id)
    expect(job?.status).toBe('CANCELED')
    expect(job?.completedAt).toBe('2026-01-01T00:02:00.000Z')
  })

  it('cascades delete from the parent edit project (ON DELETE CASCADE)', () => {
    const id = randomUUID()
    repository.create({
      id,
      editProjectId,
      status: 'QUEUED',
      progress: 0,
      outputPath: null,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null
    })

    client.sqlite.prepare('DELETE FROM edit_projects WHERE id = ?').run(editProjectId)

    expect(repository.findById(id)).toBeUndefined()
  })
})
