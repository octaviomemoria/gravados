import { randomUUID } from 'node:crypto'
import type { ProjectRepository } from '../database/repositories'
import { initializeProjectOnDisk } from '../media/project-filesystem'
import type { ProjectEntity } from '../../shared/types/entities'

/** RF-001: criar reuniao. Nesta fase cria projeto + arvore de pastas + manifest.json inicial. */
export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly libraryRootPath: string
  ) {}

  async createProject(title: string, notes?: string): Promise<ProjectEntity> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const { paths } = await initializeProjectOnDisk(this.libraryRootPath, id)
    return this.repository.create({
      id,
      title,
      createdAt,
      status: 'IDLE',
      rootPath: paths.rootPath,
      notes: notes ?? null
    })
  }

  listProjects(): ProjectEntity[] {
    return this.repository.list()
  }

  getProject(id: string): ProjectEntity | undefined {
    return this.repository.findById(id)
  }
}
