import { eq, asc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { transcripts, transcriptSegments } from '../schema'
import type { TranscriptEntity, TranscriptSegmentEntity } from '../../../shared/types/entities'

/** AI-001 - so escrito pelo `TranscriptionService` quando um `transcription_jobs` termina
 * `COMPLETED` (ver comentario em `transcription.schema.ts`) - os SEGMENTOS continuam imutaveis
 * apos criados (`transcript_segments`, usados por busca/deep-link). `editedText` (refinamento
 * pos-MVP) e a UNICA excecao a essa regra - um campo separado que o usuario pode sobrescrever
 * livremente via `updateEditedText`, sem afetar os segmentos originais. */
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

  updateEditedText(transcriptId: string, text: string): void {
    this.db.update(transcripts).set({ editedText: text }).where(eq(transcripts.id, transcriptId)).run()
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
