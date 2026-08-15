import { eq, desc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { exportJobs } from '../schema'
import type { ExportJobEntity } from '../../../shared/types/entities'

/** Unica tabela de job persistida nesta fase - ver `main/jobs/export-job-store.ts`. */
export class ExportJobRepository {
  constructor(private readonly db: AppDatabase) {}

  create(job: ExportJobEntity): ExportJobEntity {
    this.db.insert(exportJobs).values(job).run()
    return job
  }

  findById(id: string): ExportJobEntity | undefined {
    return this.db.select().from(exportJobs).where(eq(exportJobs.id, id)).get()
  }

  list(): ExportJobEntity[] {
    return this.db.select().from(exportJobs).orderBy(desc(exportJobs.createdAt)).all()
  }

  updateProgress(id: string, progress: number, status: ExportJobEntity['status']): void {
    this.db.update(exportJobs).set({ progress, status }).where(eq(exportJobs.id, id)).run()
  }

  complete(id: string, outputPath: string, completedAt: string): void {
    this.db
      .update(exportJobs)
      .set({ status: 'COMPLETED', progress: 100, outputPath, completedAt })
      .where(eq(exportJobs.id, id))
      .run()
  }

  fail(id: string, error: string, completedAt: string): void {
    this.db
      .update(exportJobs)
      .set({ status: 'FAILED', error, completedAt })
      .where(eq(exportJobs.id, id))
      .run()
  }

  /** EXP-003/004 - paralelo a `complete`/`fail`: `updateProgress` sozinho nunca grava
   * `completedAt` (so `progress`/`status`), entao um job CANCELED precisa do proprio metodo pra
   * nao ficar com `completedAt: null` pra sempre (mesmo bug de fundo corrigido em `job-runner.ts`,
   * ver comentario la sobre `transition`/`extraPatch`). */
  cancel(id: string, completedAt: string): void {
    this.db
      .update(exportJobs)
      .set({ status: 'CANCELED', completedAt })
      .where(eq(exportJobs.id, id))
      .run()
  }
}
