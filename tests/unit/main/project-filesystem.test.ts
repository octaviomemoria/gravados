import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  buildProjectPaths,
  defaultLibraryRootPath,
  assertValidProjectId,
  assertPathWithinBoundary,
  initializeProjectOnDisk,
  sanitizeFolderName,
  buildProjectFolderName,
  projectPathsFromRoot
} from '../../../src/main/media/project-filesystem'
import { ValidationError, PermissionDeniedError } from '../../../src/shared/types/domain-errors'

describe('project-filesystem', () => {
  const createdDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    )
  })

  async function makeTempLibraryRoot(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'meeting-studio-test-'))
    createdDirs.push(dir)
    return dir
  }

  it('builds the exact folder tree from 03_TECHNICAL_ARCHITECTURE.md', () => {
    const paths = buildProjectPaths('/library', 'project-123')
    expect(paths.rootPath).toBe(join('/library', 'projects', 'project-123'))
    expect(paths.manifestPath).toBe(join(paths.rootPath, 'manifest.json'))
    expect(paths.sourceScreenPath).toBe(join(paths.rootPath, 'source', 'screen'))
    expect(paths.sourceCameraPath).toBe(join(paths.rootPath, 'source', 'camera'))
    expect(paths.sourceMicrophonePath).toBe(join(paths.rootPath, 'source', 'microphone'))
    expect(paths.sourceSystemAudioPath).toBe(join(paths.rootPath, 'source', 'system-audio'))
    expect(paths.proxiesPath).toBe(join(paths.rootPath, 'proxies'))
    expect(paths.thumbnailsPath).toBe(join(paths.rootPath, 'thumbnails'))
    expect(paths.exportsPath).toBe(join(paths.rootPath, 'exports'))
    expect(paths.recoveryPath).toBe(join(paths.rootPath, 'recovery'))
  })

  it('builds the default library root under MeetingStudio', () => {
    expect(defaultLibraryRootPath('/home/user/Documents')).toBe(
      join('/home/user/Documents', 'MeetingStudio')
    )
  })

  it('rejects an invalid project id', () => {
    expect(() => assertValidProjectId('../etc/passwd')).toThrow(ValidationError)
  })

  it('accepts a valid uuid project id', () => {
    expect(() => assertValidProjectId(randomUUID())).not.toThrow()
  })

  it('rejects a path that escapes the boundary', () => {
    expect(() =>
      assertPathWithinBoundary('/library/projects/../../etc', '/library/projects')
    ).toThrow(PermissionDeniedError)
  })

  it('accepts a path within the boundary', () => {
    expect(() =>
      assertPathWithinBoundary('/library/projects/abc', '/library/projects')
    ).not.toThrow()
  })

  it('creates the full directory tree and an atomic manifest.json on disk', async () => {
    const libraryRoot = await makeTempLibraryRoot()
    const projectId = randomUUID()

    const { paths, manifest } = await initializeProjectOnDisk(libraryRoot, projectId)

    expect(manifest.projectId).toBe(projectId)
    expect(manifest.status).toBe('IDLE')
    expect(manifest.tracks).toEqual([])

    const manifestContent = await readFile(paths.manifestPath, 'utf-8')
    expect(JSON.parse(manifestContent)).toEqual(manifest)
  })
})

describe('sanitizeFolderName', () => {
  it('keeps a plain readable title unchanged', () => {
    expect(sanitizeFolderName('Reuniao de sprint')).toBe('Reuniao de sprint')
  })

  it('replaces filesystem-invalid characters (Windows) with spaces, then collapses them', () => {
    expect(sanitizeFolderName('Q3<Review>: "planning"/roadmap\\notes|*?')).toBe(
      'Q3 Review planning roadmap notes'
    )
  })

  it('strips trailing dots and spaces (Windows disallows a folder name ending in either)', () => {
    expect(sanitizeFolderName('Reuniao final...   ')).toBe('Reuniao final')
  })

  it('truncates a very long title to 60 chars', () => {
    const long = 'a'.repeat(120)
    expect(sanitizeFolderName(long)).toHaveLength(60)
  })

  it('falls back to "gravacao" for an empty/whitespace-only/all-invalid-chars title', () => {
    expect(sanitizeFolderName('')).toBe('gravacao')
    expect(sanitizeFolderName('   ')).toBe('gravacao')
    expect(sanitizeFolderName('///???')).toBe('gravacao')
  })

  it('never produces a literal ".." even from a title that sanitizes down to just dots', () => {
    // ".." sozinho e removido pelo trim de pontos/espacos finais, caindo no fallback.
    expect(sanitizeFolderName('..')).toBe('gravacao')
  })
})

describe('buildProjectFolderName', () => {
  it('combines the sanitized title with the first 8 chars of the project id', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    expect(buildProjectFolderName('Reuniao de sprint', id)).toBe('Reuniao de sprint_11111111')
  })

  it('guarantees a different folder name for two projects with the identical title', () => {
    const idA = '11111111-2222-4333-8444-555555555555'
    const idB = 'aaaaaaaa-2222-4333-8444-555555555555'
    const nameA = buildProjectFolderName('Reuniao semanal', idA)
    const nameB = buildProjectFolderName('Reuniao semanal', idB)
    expect(nameA).not.toBe(nameB)
  })

  it('never resolves to a literal ".." path segment even for a title that sanitizes to dots', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    const folderName = buildProjectFolderName('..', id)
    expect(folderName).not.toBe('..')
    expect(folderName).toBe('gravacao_11111111')
  })
})

describe('projectPathsFromRoot', () => {
  it('derives the same folder tree as buildProjectPaths, from an already-resolved rootPath', () => {
    const rootPath = join('/library', 'projects', 'Reuniao de sprint_11111111')
    const paths = projectPathsFromRoot(rootPath)
    expect(paths.rootPath).toBe(rootPath)
    expect(paths.manifestPath).toBe(join(rootPath, 'manifest.json'))
    expect(paths.sourceScreenPath).toBe(join(rootPath, 'source', 'screen'))
    expect(paths.proxiesPath).toBe(join(rootPath, 'proxies'))
  })
})
