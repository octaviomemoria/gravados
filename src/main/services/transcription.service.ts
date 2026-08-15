import { randomUUID } from 'node:crypto'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { TranscriptionJobRepository } from '../database/repositories/transcription-job.repository'
import type { TranscriptRepository } from '../database/repositories/transcript.repository'
import type { JobRunner } from '../jobs/job-runner'
import type { TranscriptionJobPayload, TranscriptionJobResult } from '../jobs/transcription-job-store'
import type { TranscriptEntity, TranscriptSegmentEntity } from '../../shared/types/entities'
import type { TranscriptResponse } from '../../shared/schemas/transcription.schema'
import { NotFoundError, ValidationError } from '../../shared/types/domain-errors'
import { createScopedLogger } from './logger'

const logger = createScopedLogger('transcription.service')

/** As duas UNICAS trilhas que este app efetivamente captura com audio embutido (ver comentario
 * identico em `render-plan.ts` sobre CAMERA/SCREEN nunca terem stream de audio) - mesma condicao
 * ja usada por `buildRenderPlan.audio` pra decidir quais trilhas entram no mix, reaproveitada
 * aqui pra decidir se ha algo pra transcrever. */
const AUDIO_CAPABLE_TRACK_TYPES = ['MICROPHONE', 'SYSTEM_AUDIO'] as const

/**
 * AI-001 (trigesimo segundo incremento - Fase 5 "Transcrição", primeiro incremento pos-Marco MVP).
 * Orquestra o QUE seria o pipeline `Edit Model → audio mixado → Provedor de IA → Transcript`, mas
 * so entrega a validacao + o enfileiramento nesta fase - NENHUM `TranscriptionProvider` (ver
 * `transcription/transcription-provider.ts`) e injetado ainda, em lugar nenhum. `startTranscription`
 * sempre enfileira com sucesso (mesmas validacoes de projeto/trilha de audio que uma integracao
 * real teria), mas o HANDLER sempre lanca um erro claro assim que roda - o job termina `FAILED`,
 * nunca `COMPLETED`, ate AI-002 conectar um provedor de verdade. Mesmo padrao deliberado ja usado
 * por `export.start` em EXP-001/002 (infra pronta, ultimo passo arriscado/custoso adiado
 * explicitamente, sem nenhum parametro "meio conectado" pra fingir o contrario).
 *
 * Por que nao ja conectar um provedor real agora: `09_SECURITY_PRIVACY_COMPLIANCE.md` §11 exige
 * um aviso explicito ANTES do primeiro envio de audio a um provedor externo ("O áudio selecionado
 * será enviado ao provedor de IA configurado para processamento") e §5 exige que a chave de API
 * (sempre DO PROPRIO usuario, nunca uma padrao deste app) seja armazenada com seguranca
 * (`safeStorage`) - as duas coisas envolvem custo real e decisao de privacidade do usuario, fora
 * do escopo de uma decisao tecnica livre pra delegar. AI-002 entrega a integracao real + esse
 * consentimento + o armazenamento seguro da chave + o pipeline de mixagem de audio (reusando
 * `buildAudioFfmpegArgs`, EXP-005) que alimenta `TranscriptionProvider.transcribe`.
 */
export class TranscriptionService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly trackRepository: TrackRepository,
    private readonly transcriptionJobRunner: JobRunner<TranscriptionJobPayload, TranscriptionJobResult>,
    private readonly transcriptionJobRepository: TranscriptionJobRepository,
    private readonly transcriptRepository: TranscriptRepository
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
    const hasAudioTrack = tracks.some((track) =>
      (AUDIO_CAPABLE_TRACK_TYPES as readonly string[]).includes(track.type)
    )
    if (!hasAudioTrack) {
      throw new ValidationError(
        'Esta gravacao nao tem nenhuma trilha de audio (microfone/audio do sistema) para transcrever.'
      )
    }

    const job = this.transcriptionJobRunner.enqueue('transcription', {
      projectId,
      provider: 'OPENAI',
      language: language ?? null
    })

    // Fogo-e-esquece deliberado, mesmo raciocinio de `ExportService.startExport` - o handler
    // SEMPRE lanca nesta fase (nenhum `TranscriptionProvider` real existe ainda em lugar
    // nenhum), `JobRunner.run` ja captura isso e marca o job `FAILED` sozinho; o `.catch` aqui
    // so cobre uma falha ANTES do try interno do runner, pra nunca virar uma rejeicao de promise
    // nao tratada.
    void this.transcriptionJobRunner
      .run(job.id, async (_payload, _reportProgress) => {
        // AI-002 (incremento futuro): mixar o audio da gravacao (reusando `buildAudioFfmpegArgs`,
        // EXP-005), chamar `provider.transcribe(...)` (`TranscriptionProvider`, ver
        // `transcription/transcription-provider.ts`), gravar via
        // `transcriptRepository.createWithSegments` (via `buildTranscriptEntities` abaixo).
        throw new Error(
          'Nenhum provedor de transcricao configurado ainda - a integracao real (AI-002) ' +
            'ainda nao foi implementada. Ver README "Próximo passo".'
        )
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
