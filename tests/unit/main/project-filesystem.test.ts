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
  initializeProjectOnDisk
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
