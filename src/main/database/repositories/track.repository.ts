import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { tracks } from '../schema'
import type { TrackEntity } from '../../../shared/types/entities'

export class TrackRepository {
  constructor(private readonly db: AppDatabase) {}

  create(track: TrackEntity): TrackEntity {
    this.db.insert(tracks).values(track).run()
    return track
  }

  listByProject(projectId: string): TrackEntity[] {
    return this.db.select().from(tracks).where(eq(tracks.projectId, projectId)).all()
  }

  findById(id: string): TrackEntity | undefined {
    return this.db.select().from(tracks).where(eq(tracks.id, id)).get()
  }
}
