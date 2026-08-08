import { eq, and } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { segments } from '../schema'
import type { SegmentEntity } from '../../../shared/types/entities'

export class SegmentRepository {
  constructor(private readonly db: AppDatabase) {}

  create(segment: SegmentEntity): SegmentEntity {
    this.db.insert(segments).values(segment).run()
    return segment
  }

  listByTrack(trackId: string): SegmentEntity[] {
    return this.db.select().from(segments).where(eq(segments.trackId, trackId)).all()
  }

  findByTrackAndIndex(trackId: string, seqIndex: number): SegmentEntity | undefined {
    return this.db
      .select()
      .from(segments)
      .where(and(eq(segments.trackId, trackId), eq(segments.seqIndex, seqIndex)))
      .get()
  }

  markFinalized(id: string, endedAtMs: number, durationMs: number, byteSize: number): void {
    this.db
      .update(segments)
      .set({ finalized: true, endedAtMs, durationMs, byteSize })
      .where(eq(segments.id, id))
      .run()
  }
}
