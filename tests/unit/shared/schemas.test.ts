import { describe, it, expect } from 'vitest'
import {
  CreateProjectRequestSchema,
  ProjectResponseSchema,
  OpenProjectFolderRequestSchema
} from '../../../src/shared/schemas/project.schema'
import { AppSettingsSchema, SETTINGS_CATEGORY_SCHEMAS } from '../../../src/shared/schemas/settings.schema'
import { StartRecordingRequestSchema } from '../../../src/shared/schemas/recording.schema'
import { StartExportRequestSchema } from '../../../src/shared/schemas/export.schema'
import {
  StartTranscriptionRequestSchema,
  TranscriptResponseSchema
} from '../../../src/shared/schemas/transcription.schema'
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

  it('accepts a valid openFolder request (uuid id)', () => {
    // Variante RFC4122 valida (nibble '8' no 3o grupo) - '1111-1111-...' usado no teste de
    // ProjectResponseSchema acima nao serve aqui porque ali o resultado esperado ja e falha
    // (status invalido), entao a validade do id em si nunca era exercitada.
    const result = OpenProjectFolderRequestSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111'
    })
    expect(result.success).toBe(true)
  })

  it('rejects an openFolder request with a non-uuid id', () => {
    expect(OpenProjectFolderRequestSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
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

  const editProjectId = '11111111-1111-4111-8111-111111111111'

  it('accepts a request without rangeMs (exports the whole timeline)', () => {
    const result = StartExportRequestSchema.safeParse({
      editProjectId,
      target: { kind: 'AUDIO', format: 'WAV' }
    })
    expect(result.success).toBe(true)
  })

  it('accepts a request with a valid rangeMs (EXP-006)', () => {
    const result = StartExportRequestSchema.safeParse({
      editProjectId,
      target: { kind: 'VIDEO', resolution: 'HD_720P' },
      rangeMs: { startMs: 1000, endMs: 5000 }
    })
    expect(result.success).toBe(true)
  })

  it('rejects a rangeMs where startMs is not smaller than endMs', () => {
    const result = StartExportRequestSchema.safeParse({
      editProjectId,
      target: { kind: 'AUDIO', format: 'MP3' },
      rangeMs: { startMs: 5000, endMs: 5000 }
    })
    expect(result.success).toBe(false)
  })

  it('rejects a target that mixes VIDEO kind with an AUDIO format field', () => {
    const result = StartExportRequestSchema.safeParse({
      editProjectId,
      target: { kind: 'VIDEO', format: 'MP3' }
    })
    expect(result.success).toBe(false)
  })
})

describe('transcription.schema', () => {
  const projectId = '11111111-1111-4111-8111-111111111111'

  it('accepts a request without language (deixa o provedor detectar automaticamente)', () => {
    expect(StartTranscriptionRequestSchema.safeParse({ projectId }).success).toBe(true)
  })

  it('accepts a request with a language code', () => {
    expect(StartTranscriptionRequestSchema.safeParse({ projectId, language: 'pt' }).success).toBe(true)
  })

  it('rejects an invalid projectId', () => {
    expect(StartTranscriptionRequestSchema.safeParse({ projectId: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects a provider other than OPENAI (unico membro do enum nesta fase, AI-001)', () => {
    const result = TranscriptResponseSchema.safeParse({
      id: projectId,
      projectId,
      provider: 'ANTHROPIC',
      model: 'whisper-1',
      language: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      segments: []
    })
    expect(result.success).toBe(false)
  })

  it('accepts a full transcript with segments', () => {
    const result = TranscriptResponseSchema.safeParse({
      id: projectId,
      projectId,
      provider: 'OPENAI',
      model: 'whisper-1',
      language: 'pt',
      createdAt: '2026-01-01T00:00:00.000Z',
      segments: [
        {
          id: projectId,
          transcriptId: projectId,
          startMs: 0,
          endMs: 1000,
          speaker: null,
          text: 'ola',
          confidence: 0.5
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})

describe('system.schema', () => {
  it('allows an omitted path', () => {
    expect(GetDiskSpaceRequestSchema.safeParse({}).success).toBe(true)
  })
})
