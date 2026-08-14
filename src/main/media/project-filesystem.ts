import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  LIBRARY_FOLDER_NAME,
  PROJECTS_FOLDER_NAME,
  MANIFEST_FILE_NAME,
  SOURCE_ROOT_FOLDER_NAME
} from '../../shared/constants/filesystem'
import { MANIFEST_SCHEMA_VERSION } from '../../shared/constants/app-info'
import { PermissionDeniedError, ValidationError } from '../../shared/types/domain-errors'
import type { RecordingState } from '../../shared/types/recording-state'
import type { TrackType } from '../../shared/types/entities'

/**
 * Arvore exata de 03_TECHNICAL_ARCHITECTURE.md secao 5. Nesta fase apenas a arvore de pastas e o
 * manifest.json inicial sao criados ao criar um projeto - nenhum arquivo de midia real e escrito.
 */
export interface ProjectPaths {
  rootPath: string
  manifestPath: string
  sourceScreenPath: string
  sourceCameraPath: string
  sourceMicrophonePath: string
  sourceSystemAudioPath: string
  proxiesPath: string
  thumbnailsPath: string
  exportsPath: string
  recoveryPath: string
}

export function defaultLibraryRootPath(documentsPath: string): string {
  return join(documentsPath, LIBRARY_FOLDER_NAME)
}

export function buildProjectPaths(libraryRootPath: string, projectId: string): ProjectPaths {
  const rootPath = join(libraryRootPath, PROJECTS_FOLDER_NAME, projectId)
  const sourceRoot = join(rootPath, SOURCE_ROOT_FOLDER_NAME)
  return {
    rootPath,
    manifestPath: join(rootPath, MANIFEST_FILE_NAME),
    sourceScreenPath: join(sourceRoot, 'screen'),
    sourceCameraPath: join(sourceRoot, 'camera'),
    sourceMicrophonePath: join(sourceRoot, 'microphone'),
    sourceSystemAudioPath: join(sourceRoot, 'system-audio'),
    proxiesPath: join(rootPath, 'proxies'),
    thumbnailsPath: join(rootPath, 'thumbnails'),
    exportsPath: join(rootPath, 'exports'),
    recoveryPath: join(rootPath, 'recovery')
  }
}

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9-]{1,100}$/

/** 09_SECURITY_PRIVACY_COMPLIANCE.md: toda acao de filesystem valida o ID do projeto antes de usar. */
export function assertValidProjectId(projectId: string): void {
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new ValidationError(`ID de projeto invalido: ${projectId}`)
  }
}

/** Garante que `candidatePath` nunca escapa (via `..`, symlink de nome, etc.) de `boundaryPath`. */
export function assertPathWithinBoundary(candidatePath: string, boundaryPath: string): void {
  const resolvedCandidate = resolve(candidatePath)
  const resolvedBoundary = resolve(boundaryPath)
  const isWithin =
    resolvedCandidate === resolvedBoundary || resolvedCandidate.startsWith(resolvedBoundary + sep)
  if (!isWithin) {
    throw new PermissionDeniedError(`Caminho fora do escopo permitido: ${candidatePath}`)
  }
}

export async function createProjectDirectoryTree(paths: ProjectPaths): Promise<void> {
  await Promise.all(
    [
      paths.sourceScreenPath,
      paths.sourceCameraPath,
      paths.sourceMicrophonePath,
      paths.sourceSystemAudioPath,
      paths.proxiesPath,
      paths.thumbnailsPath,
      paths.exportsPath,
      paths.recoveryPath
    ].map((dir) => mkdir(dir, { recursive: true }))
  )
}

/**
 * Formato do manifest.json (04_RECORDING_ENGINE.md secao 7). Usa deliberadamente um formato de
 * tipo de trilha minusculo/underscore (`screen`, `system_audio`), isolado do enum canonico
 * maiusculo do banco (`shared/types/entities.ts`) - o manifest e um artefato de recuperacao
 * independente, nao uma projecao 1:1 do schema SQL.
 */
export type ManifestTrackType = 'screen' | 'camera' | 'microphone' | 'system_audio'

/**
 * Unica tabela de traducao `TrackType` (banco, maiusculo) -> `ManifestTrackType` (manifest,
 * minusculo) - reaproveitada pelo reparo (`recovery.service.ts`) para reconstruir o manifest a
 * partir do banco. Deliberadamente NAO reaproveitada por `recording-session-manager.ts` (cujo
 * `TRACK_TYPE_INFO` interno tambem carrega `sourceName`/`getSourcePath`, acoplados ao ciclo de
 * vida de uma sessao ativa) - evita acoplar aquele modulo, ja estavel e testado, a esta.
 */
const TRACK_TYPE_TO_MANIFEST_TYPE: Record<TrackType, ManifestTrackType> = {
  SCREEN: 'screen',
  CAMERA: 'camera',
  MICROPHONE: 'microphone',
  SYSTEM_AUDIO: 'system_audio'
}

export function toManifestTrackType(type: TrackType): ManifestTrackType {
  return TRACK_TYPE_TO_MANIFEST_TYPE[type]
}

export interface ManifestSegment {
  index: number
  relativePath: string
  startedAtMs: number
  endedAtMs: number | null
  byteSize: number
  finalized: boolean
}

export interface ManifestTrack {
  id: string
  type: ManifestTrackType
  segments: ManifestSegment[]
}

/**
 * RF-010 (setimo incremento - pausar/retomar). `resumedAtMs: null` enquanto a pausa atual ainda
 * esta em andamento (04_RECORDING_ENGINE.md secao 9: "persistir: pause intervals" - dado de
 * recuperacao, nao usado ainda para compressao de timeline editorial nesta fase).
 */
export interface ManifestPauseInterval {
  pausedAtMs: number
  resumedAtMs: number | null
}

export interface ProjectManifest {
  schemaVersion: number
  projectId: string
  status: RecordingState
  startedAt: string | null
  tracks: ManifestTrack[]
  pauseIntervals: ManifestPauseInterval[]
}

export function createInitialManifest(projectId: string): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    projectId,
    status: 'IDLE',
    startedAt: null,
    tracks: [],
    pauseIntervals: []
  }
}

/** `screen_000001.webm` (04_RECORDING_ENGINE.md secao 5: `<sourceName>_<indice 6 digitos>.webm`). */
export function buildSegmentFileName(sourceName: string, index: number): string {
  return `${sourceName}_${String(index).padStart(6, '0')}.webm`
}

/**
 * Escrita atomica: grava em arquivo temporario, sincroniza em disco, depois renomeia sobre o
 * destino (04_RECORDING_ENGINE.md secao 7: "write to a temp file; flush; rename"). Evita um
 * manifest.json corrompido/parcial apos uma queda de energia ou crash no meio da escrita.
 */
export async function writeManifestAtomic(
  manifestPath: string,
  manifest: ProjectManifest
): Promise<void> {
  const tempPath = `${manifestPath}.tmp-${randomUUID()}`
  const handle = await open(tempPath, 'w')
  try {
    await handle.writeFile(JSON.stringify(manifest, null, 2), 'utf-8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(tempPath, manifestPath)
}

/**
 * RECOV-002/RECOV-003 (decimo incremento - recuperacao). Le e valida minimamente o manifest.json
 * de um projeto (usado pelo boot para detectar gravacoes interrompidas e pelo reparo para ler o
 * estado a corrigir). Retorna `null` em vez de lancar para QUALQUER falha (arquivo ausente, JSON
 * invalido, shape inesperado) - um manifest ilegivel e um caso esperado de recuperacao (nao uma
 * excecao de programacao), tratado pelo chamador como "sem dados para recuperar", nunca travando
 * o boot do app inteiro.
 */
export async function readManifest(manifestPath: string): Promise<ProjectManifest | null> {
  try {
    const raw = await readFile(manifestPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('schemaVersion' in parsed) ||
      !('tracks' in parsed) ||
      !Array.isArray((parsed as { tracks: unknown }).tracks)
    ) {
      return null
    }
    return parsed as ProjectManifest
  } catch {
    return null
  }
}

export async function initializeProjectOnDisk(
  libraryRootPath: string,
  projectId: string
): Promise<{ paths: ProjectPaths; manifest: ProjectManifest }> {
  assertValidProjectId(projectId)
  const paths = buildProjectPaths(libraryRootPath, projectId)
  assertPathWithinBoundary(paths.rootPath, join(libraryRootPath, PROJECTS_FOLDER_NAME))
  await createProjectDirectoryTree(paths)
  const manifest = createInitialManifest(projectId)
  await writeManifestAtomic(paths.manifestPath, manifest)
  return { paths, manifest }
}
