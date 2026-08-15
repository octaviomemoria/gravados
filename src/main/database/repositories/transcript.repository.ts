import { eq, asc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { transcripts, transcriptSegments } from '../schema'
import type { TranscriptEntity, TranscriptSegmentEntity } from '../../../shared/types/entities'

/** AI-001 - so escrito pelo `TranscriptionService` quando um `transcription_jobs` termina
 * `COMPLETED` (ver comentario em `transcription.schema.ts`) - nenhum metodo de update parcial
 * aqui de proposito, um transcript e imutavel apos criado nesta fase (reprocessar cria um novo). */
export class TranscriptRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Grava o cabecalho + TODOS os segmentos numa unica transacao - um transcript com so parte
   * dos segmentos gravados (crash no meio) nunca deveria ficar visivel a uma consulta. */
  createWithSegments(transcript: TranscriptEntity, segments: TranscriptSegmentEntity[]): void {
    this.db.transaction((tx) => {
      tx.insert(transcripts).values(transcript).run()
      if (segments.length > 0) {
        tx.insert(transcriptSegments).values(segments).run()
      }
    })
  }

  findByProject(projectId: string): TranscriptEntity[] {
    return this.db.select().from(transcripts).where(eq(transcripts.projectId, projectId)).all()
  }

  listSegments(transcriptId: string): TranscriptSegmentEntity[] {
    return this.db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.transcriptId, transcriptId))
      .orderBy(asc(transcriptSegments.startMs))
      .all()
  }
}
