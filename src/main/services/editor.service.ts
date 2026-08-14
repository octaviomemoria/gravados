import { randomUUID } from 'node:crypto'
import type { EditProjectRepository } from '../database/repositories/edit-project.repository'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { EditProjectEntity } from '../../shared/types/entities'
import { NotFoundError, ValidationError } from '../../shared/types/domain-errors'

/**
 * EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). Cria/consulta projetos de edicao
 * (`EditProject`) vinculados a uma gravacao (`Project`). Sem restricao de unicidade - a mesma
 * gravacao pode ter varios projetos de edicao independentes (ver comentario em
 * `shared/schemas/editor.schema.ts`).
 */
export class EditorService {
  constructor(
    private readonly editProjectRepository: EditProjectRepository,
    private readonly projectRepository: ProjectRepository
  ) {}

  /**
   * So permite criar um projeto de edicao para uma gravacao `COMPLETED` - editar uma gravacao
   * ainda `RECORDING`/`PAUSED` corromperia arquivos ainda em uso pelo `RecordingSessionManager`
   * (mesmo raciocinio de `ProjectService.assertNoActiveSession`); editar uma `RECOVERABLE`/
   * `FAILED` nao faz sentido antes de reparar (RECOV-003) ou aceitar a perda dos dados.
   */
  createEditProject(projectId: string, name?: string): EditProjectEntity {
    const project = this.projectRepository.findById(projectId)
    if (!project) throw new NotFoundError(`Projeto nao encontrado: ${projectId}`)
    if (project.status !== 'COMPLETED') {
      throw new ValidationError(
        'So e possivel editar uma gravacao concluida. Repare ou finalize a gravacao primeiro.'
      )
    }

    const now = new Date().toISOString()
    const editProject: EditProjectEntity = {
      id: randomUUID(),
      projectId,
      name: name ?? project.title,
      createdAt: now,
      updatedAt: now,
      revision: 1
    }
    return this.editProjectRepository.create(editProject)
  }

  getEditProject(id: string): EditProjectEntity {
    const editProject = this.editProjectRepository.findById(id)
    if (!editProject) throw new NotFoundError(`Projeto de edicao nao encontrado: ${id}`)
    return editProject
  }

  listEditProjects(): EditProjectEntity[] {
    return this.editProjectRepository.listAll()
  }
}
