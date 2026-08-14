import { eq, desc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { projects } from '../schema'
import type { ProjectEntity } from '../../../shared/types/entities'

export interface CreateProjectInput {
  id: string
  title: string
  createdAt: string
  status: ProjectEntity['status']
  rootPath: string
  notes?: string | null
}

/** Camada de acesso a dados para `projects` (12_DEVELOPMENT_STANDARDS.md: interface ProjectRepository). */
export class ProjectRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: CreateProjectInput): ProjectEntity {
    const row: ProjectEntity = {
      id: input.id,
      title: input.title,
      createdAt: input.createdAt,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      status: input.status,
      rootPath: input.rootPath,
      notes: input.notes ?? null
    }
    this.db.insert(projects).values(row).run()
    return row
  }

  findById(id: string): ProjectEntity | undefined {
    return this.db.select().from(projects).where(eq(projects.id, id)).get()
  }

  list(): ProjectEntity[] {
    return this.db.select().from(projects).orderBy(desc(projects.createdAt)).all()
  }

  updateStatus(id: string, status: ProjectEntity['status']): void {
    this.db.update(projects).set({ status }).where(eq(projects.id, id)).run()
  }

  /** LIB-004 (decimo primeiro incremento - renomear). */
  updateTitle(id: string, title: string): void {
    this.db.update(projects).set({ title }).where(eq(projects.id, id)).run()
  }

  /** Usado ao iniciar/finalizar uma gravacao (`startedAt`/`endedAt`/`durationMs`/`status`). */
  updateRecordingLifecycle(
    id: string,
    patch: Partial<Pick<ProjectEntity, 'status' | 'startedAt' | 'endedAt' | 'durationMs'>>
  ): void {
    this.db.update(projects).set(patch).where(eq(projects.id, id)).run()
  }

  delete(id: string): void {
    this.db.delete(projects).where(eq(projects.id, id)).run()
  }
}
