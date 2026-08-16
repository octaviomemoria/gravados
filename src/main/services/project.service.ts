import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { TrackRepository } from '../database/repositories/track.repository'
import type { SegmentRepository } from '../database/repositories/segment.repository'
import {
  initializeProjectOnDisk,
  assertPathWithinBoundary,
  assertValidProjectId
} from '../media/project-filesystem'
import { PROJECTS_FOLDER_NAME } from '../../shared/constants/filesystem'
import type { ProjectEntity } from '../../shared/types/entities'
import type { ProjectDetailsTrack } from '../../shared/schemas/project.schema'
import { NotFoundError, ValidationError } from '../../shared/types/domain-errors'

/**
 * Estados que significam "existe uma sessao de gravacao em andamento (ou recem-terminada, ainda
 * finalizando) para este projeto neste processo" - renomear/excluir um projeto nesse meio-tempo
 * corromperia arquivos ainda em uso pelo `RecordingSessionManager`. Mesma lista de
 * `RecoveryService.INTERRUPTIBLE_STATES`, reaproveitada aqui com um proposito diferente
 * (bloquear a acao, nao detectar recuperacao) - ver README "Decisões de arquitetura".
 */
const ACTIVE_SESSION_STATES: readonly ProjectEntity['status'][] = [
  'PREPARING',
  'RECORDING',
  'PAUSED',
  'STOPPING',
  'FINALIZING'
]

/** RF-001/RF-017 (Biblioteca): criar, listar, consultar, renomear e excluir reunioes. */
export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly trackRepository: TrackRepository,
    private readonly segmentRepository: SegmentRepository,
    private readonly libraryRootPath: string
  ) {}

  async createProject(title: string, notes?: string): Promise<ProjectEntity> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const { paths } = await initializeProjectOnDisk(this.libraryRootPath, id)
    return this.repository.create({
      id,
      title,
      createdAt,
      status: 'IDLE',
      rootPath: paths.rootPath,
      notes: notes ?? null
    })
  }

  listProjects(): ProjectEntity[] {
    return this.repository.list()
  }

  getProject(id: string): ProjectEntity | undefined {
    return this.repository.findById(id)
  }

  /** LIB-002: resumo por trilha agregado do banco (contagem de segmentos + bytes totais). */
  getProjectDetails(id: string): { project: ProjectEntity; tracks: ProjectDetailsTrack[]; totalBytes: number } {
    const project = this.repository.findById(id)
    if (!project) throw new NotFoundError(`Projeto nao encontrado: ${id}`)

    const tracks = this.trackRepository.listByProject(id).map((track) => {
      const segments = this.segmentRepository.listByTrack(track.id)
      const finalizedSegments = segments
        .filter((segment) => segment.finalized)
        .sort((a, b) => a.seqIndex - b.seqIndex)
      return {
        id: track.id,
        type: track.type,
        segmentCount: segments.length,
        totalBytes: segments.reduce((sum, segment) => sum + segment.byteSize, 0),
        segments: finalizedSegments.map((segment) => ({
          relativePath: segment.relativePath,
          startedAtMs: segment.startedAtMs,
          durationMs: segment.durationMs
        }))
      }
    })
    const totalBytes = tracks.reduce((sum, track) => sum + track.totalBytes, 0)

    return { project, tracks, totalBytes }
  }

  /** LIB-004: so o titulo e editavel nesta fase (ver `RenameProjectRequestSchema`). */
  async renameProject(id: string, title: string): Promise<ProjectEntity> {
    const project = this.repository.findById(id)
    if (!project) throw new NotFoundError(`Projeto nao encontrado: ${id}`)
    this.assertNoActiveSession(project)

    this.repository.updateTitle(id, title)
    return { ...project, title }
  }

  /**
   * LIB-006: remove a arvore de diretorios do disco PRIMEIRO, so removendo a linha do banco se
   * isso funcionar - ao contrario de `project.openFolder` (que trata "pasta ja sumiu" como um
   * resultado normal, nao um erro), aqui uma falha real ao apagar (ex.: arquivo aberto/travado por
   * outro processo) deve manter o projeto visivel/re-tentavel na Biblioteca, nunca sumir da lista
   * enquanto os arquivos de midia ainda ocupam disco em algum lugar sem nenhum jeito de encontra-
   * los de novo pelo app (principio de recuperabilidade/preservacao de dados do usuario).
   */
  async deleteProject(id: string): Promise<void> {
    const project = this.repository.findById(id)
    if (!project) throw new NotFoundError(`Projeto nao encontrado: ${id}`)
    this.assertNoActiveSession(project)

    assertValidProjectId(id)
    assertPathWithinBoundary(project.rootPath, join(this.libraryRootPath, PROJECTS_FOLDER_NAME))
    await rm(project.rootPath, { recursive: true, force: true })

    this.repository.delete(id)
  }

  private assertNoActiveSession(project: ProjectEntity): void {
    if (ACTIVE_SESSION_STATES.includes(project.status)) {
      throw new ValidationError(
        'Nao e possivel alterar um projeto com uma gravacao em andamento. Pare a gravacao primeiro.'
      )
    }
  }
}
