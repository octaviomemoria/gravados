import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { editProjects } from '../schema'
import type { EditProjectEntity } from '../../../shared/types/entities'

export class EditProjectRepository {
  constructor(private readonly db: AppDatabase) {}

  create(editProject: EditProjectEntity): EditProjectEntity {
    this.db.insert(editProjects).values(editProject).run()
    return editProject
  }

  findById(id: string): EditProjectEntity | undefined {
    return this.db.select().from(editProjects).where(eq(editProjects.id, id)).get()
  }

  listByProject(projectId: string): EditProjectEntity[] {
    return this.db.select().from(editProjects).where(eq(editProjects.projectId, projectId)).all()
  }
}
