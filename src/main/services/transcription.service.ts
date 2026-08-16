import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { SegmentRepository } from '../database/repositories/segment.repository'
import type { TranscriptionJobRepository } from '../database/repositories/transcription-job.repository'
import type { TranscriptRepository } from '../database/repositories/transcript.repository'
import type { JobRunner } from '../jobs/job-runner'
import type { TranscriptionJobPayload, TranscriptionJobResult } from '../jobs/transcription-job-store'
import type { TranscriptionProvider } from './transcription/transcription-provider'
import type { TranscriptEntity, TranscriptSegmentEntity } from '../../shared/types/entities'
import type { TranscriptResponse } from '../../shared/schemas/transcription.schema'
import { buildTranscriptionAudioExtractionArgs } from '../media/transcription-audio-extraction'
import { resolveFfmpegBinaries, type FfmpegBinaryPaths } from '../media/ffmpeg/ffmpeg-locator'
import { runFfmpegToCompletion } from '../media/ffmpeg/ffmpeg-runner'
import { NotFoundError, ValidationError } from '../../shared/types/domain-errors'
import { createScopedLogger } from './logger'

const logger = createScopedLogger('transcription.service')

/** As duas UNICAS trilhas que este app efetivamente captura com audio embutido (ver comentario
 * identico em `render-plan.ts` sobre CAMERA/SCREEN nunca terem stream de audio) - mesma condicao
 * ja usada por `buildRenderPlan.audio` pra decidir quais trilhas entram no mix, reaproveitada
 * aqui pra decidir se ha algo pra transcrever. */
const AUDIO_CAPABLE_TRACK_TYPES = ['MICROPHONE', 'SYSTEM_AUDIO'] as const

/**
 * AI-001 (Fase 5 "Transcrição") entregou so o CONTRATO (schema/repositorios/job/IPC/UI) - o job
 * sempre terminava `FAILED`, nenhum `TranscriptionProvider` estava conectado. Refinamento
 * pos-SEARCH-001: `WHISPER_LOCAL` (`WhisperLocalProvider`) agora roda de verdade - extrai o audio
 * bruto das trilhas MICROFONE/audio do sistema da gravacao (`buildTranscriptionAudioExtractionArgs`,
 * NUNCA a partir de um projeto de edicao - a transcricao opera sobre a gravacao crua), transcreve
 * via Whisper/ONNX 100% local, e persiste via `transcriptRepository.createWithSegments`. `OPENAI`
 * continua bloqueado (ver decisao registrada em `transcription.schema.ts`/README) - so entra em
 * jogo quando o usuario confirmar explicitamente que quer prosseguir com AI-002.
 */
export class TranscriptionService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly trackRepository: TrackRepository,
    private readonly segmentRepository: SegmentRepository,
    private readonly transcriptionJobRunner: JobRunner<TranscriptionJobPayload, TranscriptionJobResult>,
    private readonly transcriptionJobRepository: TranscriptionJobRepository,
    private readonly transcriptRepository: TranscriptRepository,
    private readonly whisperLocalProvider: TranscriptionProvider,
    private readonly ffmpegBinaryOverrides?: Partial<FfmpegBinaryPaths>
  ) {}

  startTranscription(projectId: string, language?: string) {
    const project = this.projectRepository.findById(projectId)
    if (!project) {
      throw new NotFoundError(`Projeto nao encontrado: ${projectId}`)
    }
    // Mesmo guard ja usado por `EditorService.createEditProject` - so uma gravacao TERMINADA de
    // verdade tem arquivos finais e estaveis pra mixar/enviar.
    if (project.status !== 'COMPLETED') {
      throw new ValidationError(
        `So e possivel transcrever uma gravacao concluida (status atual: ${project.status})`
      )
    }
    const tracks = this.trackRepository.listByProject(projectId)
    const audioTracks = tracks.filter(
      (track) => track.enabled && (AUDIO_CAPABLE_TRACK_TYPES as readonly string[]).includes(track.type)
    )
    if (audioTracks.length === 0) {
      throw new ValidationError(
        'Esta gravacao nao tem nenhuma trilha de audio (microfone/audio do sistema) para transcrever.'
      )
    }

    const job = this.transcriptionJobRunner.enqueue('transcription', {
      projectId,
      provider: this.whisperLocalProvider.id,
      language: language ?? null
    })

    // Fogo-e-esquece deliberado, mesmo raciocinio de `ExportService.startExport` - `JobRunner.run`
    // ja captura qualquer excecao do handler e marca o job `FAILED` sozinho; o `.catch` aqui so
    // cobre uma falha ANTES do try interno do runner, pra nunca virar uma rejeicao de promise nao
    // tratada.
    void this.transcriptionJobRunner
      .run(job.id, async (_payload, reportProgress) => {
        const transcriptId = await this.runTranscription(projectId, audioTracks, language, reportProgress)
        return { transcriptId }
      })
      .catch((error) => {
        logger.error('Falha inesperada ao executar job de transcricao', {
          jobId: job.id,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN'
        })
      })

    const created = this.transcriptionJobRepository.findById(job.id)
    if (!created) {
      throw new NotFoundError(`Job de transcricao nao encontrado apos criacao: ${job.id}`)
    }
    return created
  }

  /** Extrai+mixa o audio bruto da gravacao pra um WAV temporario, chama o provedor, persiste o
   * resultado e SEMPRE remove o temporario (sucesso ou falha) - nunca deixa lixo em
   * `os.tmpdir()`. Separado de `startTranscription` pra manter o metodo publico focado em
   * validacao+enfileiramento (mesmo padrao ja usado por `ExportService`). */
  private async runTranscription(
    projectId: string,
    audioTracks: ReturnType<TrackRepository['listByProject']>,
    language: string | undefined,
    reportProgress: (percent: number) => void
  ): Promise<string> {
    const project = this.projectRepository.findById(projectId)
    if (!project) {
      throw new NotFoundError(`Projeto nao encontrado: ${projectId}`)
    }

    const tracksForExtraction = audioTracks.map((track) => ({
      trackId: track.id,
      segments: this.segmentRepository
        .listByTrack(track.id)
        .filter((segment) => segment.finalized)
        .sort((a, b) => a.seqIndex - b.seqIndex)
        .map((segment) => ({ relativePath: segment.relativePath }))
    }))

    const tempWavPath = join(tmpdir(), `meeting-studio-transcribe-${randomUUID()}.wav`)
    const extractionArgs = buildTranscriptionAudioExtractionArgs(
      tracksForExtraction,
      project.rootPath,
      tempWavPath
    )
    if (!extractionArgs) {
      throw new ValidationError('Nenhum segmento de audio finalizado encontrado para transcrever.')
    }

    try {
      const { ffmpegPath } = resolveFfmpegBinaries(this.ffmpegBinaryOverrides)
      if (!ffmpegPath) {
        throw new Error('Binario do FFmpeg nao encontrado (ffmpeg-static) - reinstale as dependencias.')
      }
      const extraction = await runFfmpegToCompletion(ffmpegPath, extractionArgs)
      if (extraction.exitCode !== 0) {
        throw new Error(
          `Falha ao extrair audio para transcricao (codigo ${extraction.exitCode}): ${extraction.stderr.slice(-500)}`
        )
      }
      reportProgress(10)

      const result = await this.whisperLocalProvider.transcribe(
        { audioPath: tempWavPath, language },
        // O provedor reporta 0-100 sobre a PROPRIA etapa (extracao ja consumida acima, fixa em
        // 10%) - reescala pro intervalo [10, 100] restante em vez de sobrescrever com um valor
        // que retrocederia o progresso ja mostrado ao usuario.
        (percent) => reportProgress(10 + Math.round((percent / 100) * 90))
      )

      const { transcript, segments } = buildTranscriptEntities(
        projectId,
        this.whisperLocalProvider.id,
        result
      )
      this.transcriptRepository.createWithSegments(transcript, segments)
      return transcript.id
    } finally {
      await unlink(tempWavPath).catch(() => {
        // Melhor esforco - um temporario orfao em `os.tmpdir()` nao afeta a integridade dos dados
        // do app (nunca fica dentro da pasta de uma gravacao), so um resto que o SO/usuario
        // eventualmente limpa; nao vale falhar o job inteiro so por isso.
      })
    }
  }

  getStatus(jobId: string) {
    const job = this.transcriptionJobRepository.findById(jobId)
    if (!job) {
      throw new NotFoundError(`Job de transcricao nao encontrado: ${jobId}`)
    }
    return job
  }

  listJobs(projectId: string) {
    return this.transcriptionJobRepository.listByProject(projectId)
  }

  /** `null` quando o projeto nunca teve um transcript `COMPLETED` - nunca um erro (ver comentario
   * no schema). Devolve o mais RECENTE quando ha mais de um (reprocessar cria um novo, nunca
   * sobrescreve). */
  getTranscript(projectId: string): TranscriptResponse | null {
    const candidates = this.transcriptRepository.findByProject(projectId)
    if (candidates.length === 0) return null
    const latest = candidates.reduce((mostRecent, candidate) =>
      candidate.createdAt > mostRecent.createdAt ? candidate : mostRecent
    )
    const segments = this.transcriptRepository.listSegments(latest.id)
    return toTranscriptResponse(latest, segments)
  }
}

function toTranscriptResponse(
  transcript: TranscriptEntity,
  segments: TranscriptSegmentEntity[]
): TranscriptResponse {
  return {
    id: transcript.id,
    projectId: transcript.projectId,
    provider: transcript.provider as TranscriptResponse['provider'],
    model: transcript.model,
    language: transcript.language,
    createdAt: transcript.createdAt,
    segments: segments.map((segment) => ({
      id: segment.id,
      transcriptId: segment.transcriptId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      speaker: segment.speaker,
      text: segment.text,
      confidence: segment.confidence
    }))
  }
}

/** Exportado so pra uso em `TranscriptRepository.createWithSegments` por um futuro `AI-002` (gera
 * ids novos pra cabecalho+segmentos) - nao usado nesta fase (nenhum transcript e criado ainda),
 * mantido aqui porque e o unico lugar que ja sabe montar um `TranscriptEntity`/
 * `TranscriptSegmentEntity[]` a partir de um `TranscriptionResult` de provedor. */
export function buildTranscriptEntities(
  projectId: string,
  provider: string,
  result: { model: string; language: string | null; segments: readonly { startMs: number; endMs: number; speaker?: string; text: string; confidence?: number }[] }
): { transcript: TranscriptEntity; segments: TranscriptSegmentEntity[] } {
  const transcriptId = randomUUID()
  const transcript: TranscriptEntity = {
    id: transcriptId,
    projectId,
    provider,
    model: result.model,
    language: result.language,
    createdAt: new Date().toISOString()
  }
  const segments: TranscriptSegmentEntity[] = result.segments.map((segment) => ({
    id: randomUUID(),
    transcriptId,
    startMs: segment.startMs,
    endMs: segment.endMs,
    speaker: segment.speaker ?? null,
    text: segment.text,
    confidence: segment.confidence ?? null
  }))
  return { transcript, segments }
}
