import { describe, it, expect } from 'vitest'
import { CreateProjectRequestSchema, ProjectResponseSchema } from '../../../src/shared/schemas/project.schema'
import { AppSettingsSchema, SETTINGS_CATEGORY_SCHEMAS } from '../../../src/shared/schemas/settings.schema'
import { StartRecordingRequestSchema } from '../../../src/shared/schemas/recording.schema'
import { StartExportRequestSchema } from '../../../src/shared/schemas/export.schema'
import { GetDiskSpaceRequestSchema } from '../../../src/shared/schemas/system.schema'

describe('project.schema', () => {
  it('accepts a valid create request', () => {
    expect(CreateProjectRequestSchema.safeParse({ title: 'Reuniao semanal' }).success).toBe(true)
  })

  it('rejects an empty title', () => {
    expect(CreateProjectRequestSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('rejects a project response with an invalid status', () => {
    const result = ProjectResponseSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'x',
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
      durationMs: null,
      status: 'NOT_A_REAL_STATE',
      rootPath: '/x',
      notes: null
    })
    expect(result.success).toBe(false)
  })
})

describe('settings.schema', () => {
  it('accepts a valid app settings payload', () => {
    expect(AppSettingsSchema.safeParse({ theme: 'dark', defaultLibraryRootPath: '/x' }).success).toBe(
      true
    )
  })

  it('rejects an invalid theme value', () => {
    expect(AppSettingsSchema.safeParse({ theme: 'blue', defaultLibraryRootPath: '/x' }).success).toBe(
      false
    )
  })

  it('exposes exactly the three MVP settings categories', () => {
    expect(Object.keys(SETTINGS_CATEGORY_SCHEMAS)).toEqual(['app', 'recordingPresets', 'exportPresets'])
  })
})

describe('recording.schema', () => {
  it('rejects an empty project title', () => {
    expect(StartRecordingRequestSchema.safeParse({ projectTitle: '' }).success).toBe(false)
  })
})

describe('export.schema', () => {
  it('requires a valid uuid editProjectId', () => {
    expect(StartExportRequestSchema.safeParse({ editProjectId: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('system.schema', () => {
  it('allows an omitted path', () => {
    expect(GetDiskSpaceRequestSchema.safeParse({}).success).toBe(true)
  })
})
