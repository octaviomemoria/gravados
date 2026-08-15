import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import { ProjectRepository, EditProjectRepository, ExportJobRepository } from '../../../src/main/database/repositories'
import { ExportJobStore, type ExportJobPayload, type ExportJobResult } from '../../../src/main/jobs/export-job-store'
import { JobRunner } from '../../../src/main/jobs/job-runner'
import type { DatabaseClient } from '../../../src/main/database/client'

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4) - regressao para um bug real encontrado por
 * `export.service.test.ts` (integracao com FFmpeg real): `JobRunner.run()` fazia DUAS chamadas
 * separadas a `store.update` pra uma unica transicao COMPLETED/FAILED (uma so com `status`, outra
 * so com `result`/`error`) - `ExportJobStore.update` so grava `outputPath`/`error` quando ve
 * `status` e o resto do patch JUNTOS na mesma chamada, entao a segunda chamada (sem `status`)
 * silenciosamente perdia o dado. Corrigido em `job-runner.ts` (`transition` agora funde tudo numa
 * UNICA chamada via `extraPatch`). Este teste usa o `JobRunner` + `ExportJobStore` REAIS (nao um
 * store fake em memoria como `job-runner.test.ts`) - o bug so existia na combinacao dos dois.
 */
describe('ExportJobStore (via JobRunner - regressao do bug de outputPath perdido)', () => {
  let client: DatabaseClient
  let repository: ExportJobRepository
  let runner: JobRunner<ExportJobPayload, ExportJobResult>
  let editProjectId: string

  beforeEach(() => {
    client = createTestDatabase()
    const projectRepository = new ProjectRepository(client.db)
    const editProjectRepository = new EditProjectRepository(client.db)
    repository = new ExportJobRepository(client.db)
    runner = new JobRunner(new ExportJobStore(repository))

    const projectId = randomUUID()
    projectRepository.create({
      id: projectId,
      title: 'Projeto',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'IDLE',
      rootPath: '/x'
    })
    editProjectId = randomUUID()
    editProjectRepository.create({
      id: editProjectId,
      projectId,
      name: 'Edicao',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 1,
      activeOperationSequence: 0
    })
  })

  afterEach(() => {
    client.close()
  })

  it('persists outputPath in the export_jobs table when the job completes', async () => {
    const job = runner.enqueue('export', { editProjectId })
    await runner.run(job.id, async () => ({ outputPath: '/exports/out.mp4' }))

    const persisted = repository.findById(job.id)
    expect(persisted?.status).toBe('COMPLETED')
    expect(persisted?.outputPath).toBe('/exports/out.mp4')
  })

  it('persists the real error message in the export_jobs table when the job fails', async () => {
    const job = runner.enqueue('export', { editProjectId })
    await runner.run(job.id, async () => {
      throw new Error('FFmpeg falhou (codigo 1)')
    })

    const persisted = repository.findById(job.id)
    expect(persisted?.status).toBe('FAILED')
    expect(persisted?.error).toBe('FFmpeg falhou (codigo 1)')
  })

  it('persists completedAt when a queued job is canceled', () => {
    const job = runner.enqueue('export', { editProjectId })
    runner.cancel(job.id)

    const persisted = repository.findById(job.id)
    expect(persisted?.status).toBe('CANCELED')
    expect(persisted?.completedAt).toBeTruthy()
  })
})
