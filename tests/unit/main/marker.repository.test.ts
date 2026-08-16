import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import { ProjectRepository, MarkerRepository } from '../../../src/main/database/repositories'
import type { DatabaseClient } from '../../../src/main/database/client'

/**
 * Refinamento pós-LIB-PLAYER (resolve a pendência "marcadores não têm edição/exclusão depois de
 * criados"). `MarkerRepository.update`/`.delete` testados isoladamente aqui - a validação de
 * "marcador existe" (`NotFoundError`) vive no HANDLER (`markers.handlers.ts`), não no
 * repositório, então não testada neste arquivo (mesmo padrão de outros repositórios simples deste
 * app, ex. `segment.repository.ts`).
 */
describe('MarkerRepository', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let markerRepository: MarkerRepository

  beforeEach(() => {
    client = createTestDatabase()
    projectRepository = new ProjectRepository(client.db)
    markerRepository = new MarkerRepository(client.db)
  })

  afterEach(() => {
    client.close()
  })

  function createProject(): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title: 'Reuniao gravada',
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
      rootPath: `C:\\fake\\${id}`
    })
    return { id }
  }

  describe('update', () => {
    it('updates title and note independently', () => {
      const project = createProject()
      const markerId = randomUUID()
      markerRepository.create({
        id: markerId,
        projectId: project.id,
        timestampMs: 1000,
        title: 'Original',
        note: 'Nota original'
      })

      markerRepository.update(markerId, { title: 'Novo titulo' })
      let updated = markerRepository.findById(markerId)
      expect(updated!.title).toBe('Novo titulo')
      expect(updated!.note).toBe('Nota original')

      markerRepository.update(markerId, { note: 'Nova nota' })
      updated = markerRepository.findById(markerId)
      expect(updated!.title).toBe('Novo titulo')
      expect(updated!.note).toBe('Nova nota')
    })

    it('clears a field when patched with null explicitly', () => {
      const project = createProject()
      const markerId = randomUUID()
      markerRepository.create({
        id: markerId,
        projectId: project.id,
        timestampMs: 0,
        title: 'Titulo',
        note: 'Nota'
      })

      markerRepository.update(markerId, { title: null, note: null })
      const updated = markerRepository.findById(markerId)
      expect(updated!.title).toBeNull()
      expect(updated!.note).toBeNull()
    })

    it('leaves fields untouched when omitted from the patch', () => {
      const project = createProject()
      const markerId = randomUUID()
      markerRepository.create({
        id: markerId,
        projectId: project.id,
        timestampMs: 0,
        title: 'Titulo',
        note: 'Nota'
      })

      markerRepository.update(markerId, {})
      const updated = markerRepository.findById(markerId)
      expect(updated!.title).toBe('Titulo')
      expect(updated!.note).toBe('Nota')
    })
  })

  describe('delete', () => {
    it('removes the marker permanently', () => {
      const project = createProject()
      const markerId = randomUUID()
      markerRepository.create({
        id: markerId,
        projectId: project.id,
        timestampMs: 0,
        title: null,
        note: null
      })
      expect(markerRepository.findById(markerId)).toBeTruthy()

      markerRepository.delete(markerId)
      expect(markerRepository.findById(markerId)).toBeUndefined()
    })

    it('does not affect other markers of the same project', () => {
      const project = createProject()
      const keepId = randomUUID()
      const removeId = randomUUID()
      markerRepository.create({ id: keepId, projectId: project.id, timestampMs: 0, title: null, note: null })
      markerRepository.create({ id: removeId, projectId: project.id, timestampMs: 1000, title: null, note: null })

      markerRepository.delete(removeId)
      const remaining = markerRepository.listByProject(project.id)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]!.id).toBe(keepId)
    })
  })

  describe('findById', () => {
    it('returns undefined for an unknown id', () => {
      expect(markerRepository.findById(randomUUID())).toBeUndefined()
    })
  })
})
