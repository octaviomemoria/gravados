import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import { ProjectRepository, EditProjectRepository } from '../../../src/main/database/repositories'
import { EditorService } from '../../../src/main/services/editor.service'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { ProjectEntity } from '../../../src/shared/types/entities'

/** EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). */
describe('EditorService', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let editProjectRepository: EditProjectRepository
  let service: EditorService

  beforeEach(() => {
    client = createTestDatabase()
    projectRepository = new ProjectRepository(client.db)
    editProjectRepository = new EditProjectRepository(client.db)
    service = new EditorService(editProjectRepository, projectRepository)
  })

  afterEach(() => {
    client.close()
  })

  function createProject(status: ProjectEntity['status'] = 'COMPLETED', title = 'Reuniao gravada'): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title,
      createdAt: new Date().toISOString(),
      status,
      rootPath: `/library/projects/${id}`
    })
    return { id }
  }

  describe('createEditProject', () => {
    it('creates an edit project for a COMPLETED recording, defaulting the name to the recording title', () => {
      const project = createProject('COMPLETED', 'Reuniao de kickoff')
      const editProject = service.createEditProject(project.id)
      expect(editProject.projectId).toBe(project.id)
      expect(editProject.name).toBe('Reuniao de kickoff')
      expect(editProject.revision).toBe(1)
      expect(editProjectRepository.findById(editProject.id)).toBeDefined()
    })

    it('accepts a custom name', () => {
      const project = createProject('COMPLETED')
      const editProject = service.createEditProject(project.id, 'Versao curta')
      expect(editProject.name).toBe('Versao curta')
    })

    it('throws NotFoundError for an unknown project', () => {
      expect(() => service.createEditProject(randomUUID())).toThrow('nao encontrado')
    })

    it.each(['IDLE', 'RECORDING', 'PAUSED', 'RECOVERABLE', 'FAILED'] as const)(
      'rejects creating an edit project for a recording with status %s',
      (status) => {
        const project = createProject(status)
        expect(() => service.createEditProject(project.id)).toThrow('gravacao concluida')
      }
    )

    it('allows multiple independent edit projects for the same recording', () => {
      const project = createProject('COMPLETED')
      const first = service.createEditProject(project.id, 'Versao completa')
      const second = service.createEditProject(project.id, 'Versao curta')
      expect(first.id).not.toBe(second.id)
      expect(editProjectRepository.listByProject(project.id)).toHaveLength(2)
    })
  })

  describe('getEditProject', () => {
    it('returns an existing edit project by id', () => {
      const project = createProject()
      const created = service.createEditProject(project.id)
      expect(service.getEditProject(created.id)).toEqual(created)
    })

    it('throws NotFoundError for an unknown edit project', () => {
      expect(() => service.getEditProject(randomUUID())).toThrow('nao encontrado')
    })
  })

  describe('listEditProjects', () => {
    it('lists edit projects across different recordings', () => {
      const first = createProject('COMPLETED', 'Reuniao A')
      const second = createProject('COMPLETED', 'Reuniao B')
      service.createEditProject(first.id)
      service.createEditProject(second.id)

      const all = service.listEditProjects()
      expect(all).toHaveLength(2)
      expect(all.map((editProject) => editProject.projectId).sort()).toEqual(
        [first.id, second.id].sort()
      )
    })

    it('returns an empty list when there are no edit projects yet', () => {
      expect(service.listEditProjects()).toEqual([])
    })
  })
})
