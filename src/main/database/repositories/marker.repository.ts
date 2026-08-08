import { eq, asc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { markers } from '../schema'
import type { MarkerEntity } from '../../../shared/types/entities'

export class MarkerRepository {
  constructor(private readonly db: AppDatabase) {}

  create(marker: MarkerEntity): MarkerEntity {
    this.db.insert(markers).values(marker).run()
    return marker
  }

  listByProject(projectId: string): MarkerEntity[] {
    return this.db
      .select()
      .from(markers)
      .where(eq(markers.projectId, projectId))
      .orderBy(asc(markers.timestampMs))
      .all()
  }
}
