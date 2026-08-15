import { join } from 'node:path'
import type { EditProjectRepository } from '../database/repositories/edit-project.repository'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { ExportJobRepository } from '../database/repositories/export-job.repository'
import type { EditorService } from './editor.service'
import { buildRenderPlan } from '../media/render-plan'
import { buildFfmpegArgs } from '../media/ffmpeg-command'
import { resolveFfmpegBinaries } from '../media/ffmpeg/ffmpeg-locator'
import { runFfmpegProcess } from '../media/ffmpeg/ffmpeg-runner'
import type { JobRunner } from '../jobs/job-runner'
import type { ExportJobPayload, ExportJobResult } from '../jobs/export-job-store'
import type { ExportJobResponse, ExportResolution } from '../../shared/schemas/export.schema'
import { NotFoundError, ValidationError } from '../../shared/types/domain-errors'
import { createScopedLogger } from './logger'

const logger = createScopedLogger('export.service')

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4, "Render Job" da doc - `05_MEDIA_EDITOR.md`
 * §12: `Edit Model → Timeline Compiler → FFmpeg Plan → Render Job → Validation → Output`). Orquestra
 * o pipeline inteiro: timeline editada -> `RenderPlan` (EXP-001) -> args FFmpeg (EXP-003) -> job
 * assincrono via `JobRunner`/`ExportJobRepository` (ja instanciados desde a Fase 0/EXP-001, so
 * agora exercitados de verdade) -> processo FFmpeg real (EXP-002) -> arquivo MP4 em
 * `<rootPath>/exports/`.
 *
 * ESCOPO DESTE INCREMENTO: so o caminho de uma unica trilha de video (fundo) - `buildFfmpegArgs`
 * retorna `null` (e este servico rejeita ANTES de enfileirar) pra qualquer plano PiP/lado-a-lado
 * ou totalmente sem video (audio-only) - ambos ficam pra incrementos futuros (EXP-004b/EXP-005).
 * `startExport` e SINCRONO no enfileiramento (cria o job, dispara o FFmpeg em segundo plano) -
 * o handler IPC devolve o job em `QUEUED` imediatamente, sem o renderer bloquear esperando o
 * render inteiro (o mesmo raciocinio ja usado pelo `JobRunner` desde que foi desenhado).
 */
export class ExportService {
  constructor(
    private readonly editProjectRepository: EditProjectRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly editorService: EditorService,
    private readonly exportJobRunner: JobRunner<ExportJobPayload, ExportJobResult>,
    private readonly exportJobRepository: ExportJobRepository
  ) {}

  startExport(editProjectId: string, resolution: ExportResolution): ExportJobResponse {
    const editProject = this.editProjectRepository.findById(editProjectId)
    if (!editProject) {
      throw new NotFoundError(`Projeto de edicao nao encontrado: ${editProjectId}`)
    }
    const project = this.projectRepository.findById(editProject.projectId)
    if (!project) {
      throw new NotFoundError(`Projeto nao encontrado: ${editProject.projectId}`)
    }

    const timeline = this.editorService.getEditedTimeline(editProjectId)
    if (timeline.totalDurationMs <= 0) {
      throw new ValidationError('A timeline esta vazia - nao ha nada para exportar')
    }

    const plan = buildRenderPlan(timeline, { resolution })
    const outputFileName = `export_${resolution.toLowerCase()}_${Date.now()}.mp4`
    const outputPath = join(project.rootPath, 'exports', outputFileName)

    const args = buildFfmpegArgs(plan, project.rootPath, outputPath)
    if (!args) {
      throw new ValidationError(
        'Esta timeline nao pode ser exportada ainda: exportacao so suporta layout de trilha unica ' +
          '(sem PiP/lado-a-lado) e exige pelo menos uma trilha de video. PiP/lado-a-lado ficam para ' +
          'um incremento futuro.'
      )
    }

    const { ffmpegPath } = resolveFfmpegBinaries()
    if (!ffmpegPath) {
      throw new ValidationError('Binario do FFmpeg nao encontrado - reinstale as dependencias do app')
    }

    const job = this.exportJobRunner.enqueue('export', { editProjectId })
    const totalDurationMs = plan.output.endMs - plan.output.startMs

    // Fogo-e-esquece deliberado: o IPC ja devolveu o job QUEUED ao chamador (ver `return` abaixo) -
    // `JobRunner.run` ja captura qualquer falha do handler internamente (marca o job FAILED), o
    // `.catch` aqui so cobre uma falha ANTES do try interno (ex.: transicao QUEUED->RUNNING
    // invalida, nunca esperado no fluxo normal) para nunca virar uma rejeicao de promise nao
    // tratada.
    void this.exportJobRunner
      .run(job.id, async (_payload, reportProgress) => {
        const handle = runFfmpegProcess({
          binaryPath: ffmpegPath,
          args,
          onProgress: reportProgress,
          totalDurationMs
        })
        const result = await handle.result
        if (result.canceled) {
          throw new Error('Exportacao cancelada')
        }
        if (result.exitCode !== 0) {
          throw new Error(`FFmpeg falhou (codigo ${result.exitCode}): ${result.stderr.slice(-2000)}`)
        }
        return { outputPath }
      })
      .catch((error) => {
        logger.error('Falha inesperada ao executar job de exportacao', {
          jobId: job.id,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN'
        })
      })

    const created = this.exportJobRepository.findById(job.id)
    if (!created) {
      // Defensivo - `exportJobRunner.enqueue` acabou de chamar `ExportJobStore.create`, que grava
      // sincronamente na tabela `export_jobs`; nao deveria faltar aqui.
      throw new NotFoundError(`Job de exportacao nao encontrado apos criacao: ${job.id}`)
    }
    return created
  }
}
