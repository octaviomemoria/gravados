import { join } from 'node:path'
import type { EditProjectRepository } from '../database/repositories/edit-project.repository'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { ExportJobRepository } from '../database/repositories/export-job.repository'
import type { EditorService } from './editor.service'
import { buildRenderPlan } from '../media/render-plan'
import { buildFfmpegArgs, buildAudioFfmpegArgs } from '../media/ffmpeg-command'
import { resolveFfmpegBinaries, type FfmpegBinaryPaths } from '../media/ffmpeg/ffmpeg-locator'
import {
  runFfmpegProcess,
  runFfprobeProcess,
  buildFfprobeArgs,
  validateFfprobeOutput
} from '../media/ffmpeg/ffmpeg-runner'
import type { JobRunner } from '../jobs/job-runner'
import type { ExportJobPayload, ExportJobResult } from '../jobs/export-job-store'
import type {
  ExportJobResponse,
  ExportTarget,
  ExportTimeRange,
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
 * EXP-003/004/005/008/009/004b (vigesimo quinto/sexto/oitavo/nono/trigesimo incrementos - Fase 4,
 * "Render Job" da doc - `05_MEDIA_EDITOR.md` §12: `Edit Model → Timeline Compiler → FFmpeg Plan →
 * Render Job → Validation → Output`, TODAS as etapas implementadas desde EXP-009). Orquestra o
 * pipeline inteiro: timeline editada -> `RenderPlan` (EXP-001) -> args FFmpeg (EXP-003 video, com
 * PiP/lado-a-lado reais desde EXP-004b / EXP-005 audio) -> job assincrono via `JobRunner`/
 * `ExportJobRepository` (ja instanciados desde a Fase 0/EXP-001, so agora exercitados de verdade)
 * -> processo FFmpeg real (EXP-002, cancelavel de verdade desde EXP-008) -> validacao real via
 * ffprobe (EXP-009 - `exitCode 0` sozinho nunca provava que o arquivo escrito e utilizavel de
 * verdade) -> arquivo em `<rootPath>/exports/`. Progresso (EXP-007) ja fluia pra UI desde
 * EXP-003/004 (a mesma infraestrutura `onProgress`/`JobRunner` ja existia, so nunca tinha sido
 * exercitada de ponta a ponta).
 *
 * `target.kind` decide entre VIDEO (MP4 720p/1080p, `buildFfmpegArgs` - trilha unica, PiP OU
 * lado-a-lado, o MESMO layout que `computePreviewLayout` resolveu pro editor, ver EXP-004b) e
 * AUDIO (M4A/MP3/WAV, `buildAudioFfmpegArgs`) - ver `ExportTargetSchema`. `rangeMs` opcional
 * (EXP-006, RF-034) recorta a exportacao pra so uma FAIXA da timeline - validado aqui contra
 * `totalDurationMs` (o schema em si so garante `startMs < endMs`, nunca conhece a duracao real de
 * uma timeline especifica).
 * `startExport` e SINCRONO no enfileiramento (cria o job, dispara o FFmpeg em segundo plano) -
 * o handler IPC devolve o job em `QUEUED` imediatamente, sem o renderer bloquear esperando o
 * render inteiro (o mesmo raciocinio ja usado pelo `JobRunner` desde que foi desenhado).
 */
export class ExportService {
  /** EXP-008 - rastreia o `cancel()` do PROCESSO FFmpeg real em voo, por job id - o unico jeito
   * de `cancelExport` conseguir matar um processo em andamento, ja que `JobRunner`/`ExportJobStore`
   * so conhecem estado (status/progresso), nunca o processo do SO em si. Entrada removida no
   * `finally` do handler de `startExport`, logo apos `handle.result` resolver (sucesso, falha ou
   * cancelamento) - nunca fica um cancel "orfao" apontando pra um processo ja morto (`cancel()` em
   * cima de um processo ja morto e um no-op seguro do proprio `runFfmpegProcess`, mas nao ha razao
   * pra manter a referencia depois que o job termina). */
  private readonly activeCancelFns = new Map<string, () => void>()

  constructor(
    private readonly editProjectRepository: EditProjectRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly editorService: EditorService,
    private readonly exportJobRunner: JobRunner<ExportJobPayload, ExportJobResult>,
    private readonly exportJobRepository: ExportJobRepository,
    /** EXP-009 - override opcional pra `resolveFfmpegBinaries`, existe SO pra teste (apontar o
     * ffprobe pra um binario propositalmente quebrado sem precisar de uma variavel de ambiente
     * global, que vazaria pra qualquer outro teste rodando em paralelo no mesmo processo). Em
     * producao sempre `undefined` - `app-context.ts` nunca passa este parametro. */
    private readonly ffmpegBinaryOverrides?: Partial<FfmpegBinaryPaths>
  ) {}

  startExport(
    editProjectId: string,
    target: ExportTarget,
    rangeMs?: ExportTimeRange | null
  ): ExportJobResponse {
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
    // EXP-006 - `ExportTimeRangeSchema` ja garante `startMs < endMs`; so falta validar contra a
    // duracao REAL desta timeline especifica, que o schema nunca conhece. `startMs < 0` nunca
    // acontece (schema `nonnegative()`), so `endMs` pode exceder.
    if (rangeMs && rangeMs.endMs > timeline.totalDurationMs) {
      throw new ValidationError(
        'O intervalo selecionado vai alem do fim atual da timeline - selecione novamente antes de exportar.'
      )
    }

    let outputPath: string
    let args: string[] | null
    let totalDurationMs: number

    if (target.kind === 'VIDEO') {
      const plan = buildRenderPlan(timeline, { resolution: target.resolution, rangeMs })
      const outputFileName = `export_${target.resolution.toLowerCase()}_${Date.now()}.mp4`
      outputPath = join(project.rootPath, 'exports', outputFileName)
      args = buildFfmpegArgs(plan, project.rootPath, outputPath)
      totalDurationMs = plan.output.endMs - plan.output.startMs
      if (!args) {
        throw new ValidationError(
          'Esta timeline nao pode ser exportada em video: exige pelo menos uma trilha de video ' +
            'com conteudo (a gravacao pode ser so de audio, ou uma trilha de video sem nenhum clip).'
        )
      }
    } else {
      const plan = buildRenderPlan(timeline, { rangeMs })
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

    const { ffmpegPath, ffprobePath } = resolveFfmpegBinaries(this.ffmpegBinaryOverrides)
    if (!ffmpegPath) {
      throw new ValidationError('Binario do FFmpeg nao encontrado - reinstale as dependencias do app')
    }
    if (!ffprobePath) {
      throw new ValidationError('Binario do FFprobe nao encontrado - reinstale as dependencias do app')
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
        // EXP-008 - registra o `cancel()` DESTE processo especifico ANTES de aguardar o
        // resultado, pra `cancelExport` conseguir encontra-lo enquanto o FFmpeg ainda esta rodando.
        this.activeCancelFns.set(job.id, handle.cancel)
        try {
          const result = await handle.result
          if (result.canceled) {
            // `cancelExport` ja moveu o job pra CANCELED diretamente (ver comentario la) - o
            // `JobRunner.run` que chamou este handler ja re-checa o status antes de tentar
            // qualquer transicao, entao lancar aqui NAO sobrescreve CANCELED com FAILED (fix
            // registrado em `job-runner.ts`). So precisa parar de executar, sem produzir um
            // resultado que seria interpretado como sucesso.
            throw new Error('Exportacao cancelada pelo usuario')
          }
          if (result.exitCode !== 0) {
            throw new Error(`FFmpeg falhou (codigo ${result.exitCode}): ${result.stderr.slice(-2000)}`)
          }
          // EXP-009 (RenderPlan doc §12, etapa "Validation") - `exitCode 0` sozinho nao prova que
          // o arquivo escrito e um arquivo de midia REAL e utilizavel (um encode que produziu zero
          // frames, por exemplo, ainda pode sair com exitCode 0 em alguns casos de borda). Roda o
          // ffprobe de verdade contra o proprio `outputPath` antes de aceitar o resultado como
          // sucesso - um `throw` aqui e capturado pelo `catch` de `JobRunner.run()`, marcando o job
          // `FAILED` (nunca `COMPLETED`) com o motivo exato da invalidez.
          const probeResult = await runFfprobeProcess(ffprobePath, buildFfprobeArgs(outputPath))
          if (probeResult.exitCode !== 0) {
            throw new Error(
              `Validacao do arquivo exportado falhou (ffprobe saiu com codigo ${probeResult.exitCode}): ${probeResult.stderr.slice(-1000)}`
            )
          }
          const validation = validateFfprobeOutput(probeResult.stdout)
          if (!validation.valid) {
            throw new Error(`Arquivo exportado invalido: ${validation.reason}`)
          }
          return { outputPath }
        } finally {
          this.activeCancelFns.delete(job.id)
        }
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

  /**
   * EXP-008 (vigesimo oitavo incremento - Fase 4, RF-035 "possibilidade de cancelar"). Mata o
   * processo FFmpeg real (`activeCancelFns`) E move o job pra `CANCELED` diretamente via
   * `exportJobRunner.cancel` - as DUAS coisas, nao uma so: matar so o processo sem atualizar o
   * job deixaria o status preso em `RUNNING` pra sempre (o handler que ia marcar `COMPLETED`/
   * `FAILED` nunca roda de novo); atualizar so o status sem matar o processo deixaria o FFmpeg
   * real rodando em segundo plano, gravando um arquivo que ninguem mais vai usar.
   *
   * Idempotente por design: chamar num job que ja terminou (COMPLETED/FAILED/CANCELED) e um
   * no-op silencioso - `activeCancelFns.get()` retorna `undefined` (a entrada ja foi removida no
   * `finally` de `startExport`) e o `if` abaixo pula a chamada a `exportJobRunner.cancel` (que
   * lancaria `InvalidJobTransitionError` se chamada num estado terminal). Isso importa porque a
   * UI pode legitimamente disparar um clique de cancelar bem no instante em que o job ja
   * terminou por conta propria (corrida natural, nao um bug) - nunca deveria virar um erro visivel
   * pro usuario so por causa do timing.
   */
  cancelExport(jobId: string): ExportJobResponse {
    const job = this.exportJobRepository.findById(jobId)
    if (!job) {
      throw new NotFoundError(`Job de exportacao nao encontrado: ${jobId}`)
    }
    if (job.status === 'QUEUED' || job.status === 'RUNNING') {
      this.activeCancelFns.get(jobId)?.()
      this.exportJobRunner.cancel(jobId)
    }
    // Re-busca - `exportJobRunner.cancel` (quando chamado) ja persistiu CANCELED sincronamente.
    return this.exportJobRepository.findById(jobId)!
  }
}
