import { eq, asc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { editOperations } from '../schema'
import type { EditOperationEntity } from '../../../shared/types/entities'

export class EditOperationRepository {
  constructor(private readonly db: AppDatabase) {}

  create(operation: EditOperationEntity): EditOperationEntity {
    this.db.insert(editOperations).values(operation).run()
    return operation
  }

  listByEditProject(editProjectId: string): EditOperationEntity[] {
    return this.db
      .select()
      .from(editOperations)
      .where(eq(editOperations.editProjectId, editProjectId))
      .orderBy(asc(editOperations.sequence))
      .all()
  }
}
