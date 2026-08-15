import { eq, desc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { transcriptionJobs } from '../schema'
import type { TranscriptionJobEntity } from '../../../shared/types/entities'

/** AI-001 - mesma forma de `ExportJobRepository` (unica outra tabela de job persistida ate aqui) -
 * `create`/`updateProgress`/`complete`/`fail`/`cancel` reusam exatamente o mesmo raciocinio de
 * `JobRunner.transition`/`extraPatch` (ver comentario em `job-runner.ts`): uma transicao pra um
 * estado terminal grava status+completedAt(+error) numa UNICA chamada, nunca duas separadas -
 * o mesmo bug real corrigido em EXP-003/004 (`outputPath` perdido) ficaria latente aqui tambem se
 * a transicao final fosse partida em duas chamadas. */
export class TranscriptionJobRepository {
  constructor(private readonly db: AppDatabase) {}

  create(job: TranscriptionJobEntity): TranscriptionJobEntity {
    this.db.insert(transcriptionJobs).values(job).run()
    return job
  }

  findById(id: string): TranscriptionJobEntity | undefined {
    return this.db.select().from(transcriptionJobs).where(eq(transcriptionJobs.id, id)).get()
  }

  listByProject(projectId: string): TranscriptionJobEntity[] {
    return this.db
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.projectId, projectId))
      .orderBy(desc(transcriptionJobs.createdAt))
      .all()
  }

  updateProgress(id: string, progress: number, status: TranscriptionJobEntity['status']): void {
    this.db.update(transcriptionJobs).set({ progress, status }).where(eq(transcriptionJobs.id, id)).run()
  }

  complete(id: string, completedAt: string): void {
    this.db
      .update(transcriptionJobs)
      .set({ status: 'COMPLETED', progress: 100, completedAt })
      .where(eq(transcriptionJobs.id, id))
      .run()
  }

  fail(id: string, error: string, completedAt: string): void {
    this.db
      .update(transcriptionJobs)
      .set({ status: 'FAILED', error, completedAt })
      .where(eq(transcriptionJobs.id, id))
      .run()
  }

  cancel(id: string, completedAt: string): void {
    this.db
      .update(transcriptionJobs)
      .set({ status: 'CANCELED', completedAt })
      .where(eq(transcriptionJobs.id, id))
      .run()
  }
}
