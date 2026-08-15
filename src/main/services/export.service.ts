import { join } from 'node:path'
import type { EditProjectRepository } from '../database/repositories/edit-project.repository'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { ExportJobRepository } from '../database/repositories/export-job.repository'
import type { EditorService } from './editor.service'
import { buildRenderPlan } from '../media/render-plan'
import { buildFfmpegArgs, buildAudioFfmpegArgs } from '../media/ffmpeg-command'
import { resolveFfmpegBinaries } from '../media/ffmpeg/ffmpeg-locator'
import { runFfmpegProcess } from '../media/ffmpeg/ffmpeg-runner'
import type { JobRunner } from '../jobs/job-runner'
import type { ExportJobPayload, ExportJobResult } from '../jobs/export-job-store'
import type {
  ExportJobResponse,
  ExportTarget,
  AudioExportFormat
} from '../../shared/schemas/export.schema'
import { NotFoundError, ValidationError } from '../../shared/types/domain-errors'
import { createScopedLogger } from './logger'

const logger = createScopedLogger('export.service')

/** EXP-005 - extensao real do arquivo por formato de audio - minusculo, convencao padrao pra
 * essas 3 extensoes (ao contrario do container de video, sempre `.mp4` neste app). */
const AUDIO_FILE_EXTENSION: Record<AudioExportFormat, string> = {
  M4A: 'm4a',
  MP3: 'mp3',
  WAV: 'wav'
}

/**
 * EXP-003/004/005 (vigesimo quinto/sexto incrementos - Fase 4, "Render Job" da doc -
 * `05_MEDIA_EDITOR.md` §12: `Edit Model → Timeline Compiler → FFmpeg Plan → Render Job →
 * Validation → Output`). Orquestra o pipeline inteiro: timeline editada -> `RenderPlan` (EXP-001)
 * -> args FFmpeg (EXP-003 video / EXP-005 audio) -> job assincrono via `JobRunner`/
 * `ExportJobRepository` (ja instanciados desde a Fase 0/EXP-001, so agora exercitados de verdade)
 * -> processo FFmpeg real (EXP-002) -> arquivo em `<rootPath>/exports/`.
 *
 * `target.kind` decide entre VIDEO (MP4 720p/1080p, `buildFfmpegArgs`) e AUDIO (M4A/MP3/WAV,
 * `buildAudioFfmpegArgs`) - ver `ExportTargetSchema`. ESCOPO AINDA LIMITADO no caminho de video: so
 * uma unica trilha de fundo (`buildFfmpegArgs` retorna `null`, rejeitado ANTES de enfileirar, pra
 * qualquer plano PiP/lado-a-lado) - fica pro incremento futuro EXP-004b.
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

  startExport(editProjectId: string, target: ExportTarget): ExportJobResponse {
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

    let outputPath: string
    let args: string[] | null
    let totalDurationMs: number

    if (target.kind === 'VIDEO') {
      const plan = buildRenderPlan(timeline, { resolution: target.resolution })
      const outputFileName = `export_${target.resolution.toLowerCase()}_${Date.now()}.mp4`
      outputPath = join(project.rootPath, 'exports', outputFileName)
      args = buildFfmpegArgs(plan, project.rootPath, outputPath)
      totalDurationMs = plan.output.endMs - plan.output.startMs
      if (!args) {
        throw new ValidationError(
          'Esta timeline nao pode ser exportada em video ainda: exportacao so suporta layout de ' +
            'trilha unica (sem PiP/lado-a-lado) e exige pelo menos uma trilha de video. ' +
            'PiP/lado-a-lado ficam para um incremento futuro.'
        )
      }
    } else {
      const plan = buildRenderPlan(timeline, {})
      const extension = AUDIO_FILE_EXTENSION[target.format]
      const outputFileName = `export_${target.format.toLowerCase()}_${Date.now()}.${extension}`
      outputPath = join(project.rootPath, 'exports', outputFileName)
      args = buildAudioFfmpegArgs(plan, project.rootPath, outputPath, target.format)
      totalDurationMs = plan.output.endMs - plan.output.startMs
      if (!args) {
        throw new ValidationError(
          'Esta timeline nao pode ser exportada em audio: nenhuma trilha de audio nao-mutada ' +
            '(microfone/audio do sistema) foi encontrada.'
        )
      }
    }

    // TypeScript nao restringe `args` pra `string[]` so pelo `throw` acima (fica `string[] | null`
    // no bloco a seguir) - reatribuido explicitamente apos os dois guards, mesmo padrao defensivo
    // ja usado no resto do servico.
    const resolvedArgs: string[] = args

    const { ffmpegPath } = resolveFfmpegBinaries()
    if (!ffmpegPath) {
      throw new ValidationError('Binario do FFmpeg nao encontrado - reinstale as dependencias do app')
    }

    const job = this.exportJobRunner.enqueue('export', { editProjectId })

    // Fogo-e-esquece deliberado: o IPC ja devolveu o job QUEUED ao chamador (ver `return` abaixo) -
    // `JobRunner.run` ja captura qualquer falha do handler internamente (marca o job FAILED), o
    // `.catch` aqui so cobre uma falha ANTES do try interno (ex.: transicao QUEUED->RUNNING
    // invalida, nunca esperado no fluxo normal) para nunca virar uma rejeicao de promise nao
    // tratada.
    void this.exportJobRunner
      .run(job.id, async (_payload, reportProgress) => {
        const handle = runFfmpegProcess({
          binaryPath: ffmpegPath,
          args: resolvedArgs,
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
