import { describe, it, expect } from 'vitest'
import { transcriptDisplayText } from '../../../src/renderer/features/library/transcript-display-text'
import type { TranscriptResponse } from '../../../src/shared/schemas/transcription.schema'

function buildTranscript(overrides: Partial<TranscriptResponse> = {}): TranscriptResponse {
  return {
    id: 'transcript-1',
    projectId: 'project-1',
    provider: 'WHISPER_LOCAL',
    model: 'whisper-base',
    language: 'pt',
    createdAt: new Date().toISOString(),
    editedText: null,
    segments: [],
    ...overrides
  }
}

describe('transcriptDisplayText', () => {
  it('joins segment texts with a single space when there is no edited text', () => {
    const transcript = buildTranscript({
      segments: [
        { id: '1', transcriptId: 't', startMs: 0, endMs: 1000, speaker: null, text: 'Ola', confidence: null },
        { id: '2', transcriptId: 't', startMs: 1000, endMs: 2000, speaker: null, text: 'mundo.', confidence: null }
      ]
    })
    expect(transcriptDisplayText(transcript)).toBe('Ola mundo.')
  })

  it('prefers editedText over segments when present, even if editedText is empty', () => {
    const transcript = buildTranscript({
      editedText: '',
      segments: [
        { id: '1', transcriptId: 't', startMs: 0, endMs: 1000, speaker: null, text: 'original', confidence: null }
      ]
    })
    expect(transcriptDisplayText(transcript)).toBe('')
  })

  it('prefers a non-empty editedText over the original segments', () => {
    const transcript = buildTranscript({
      editedText: 'texto corrigido pelo usuario',
      segments: [
        { id: '1', transcriptId: 't', startMs: 0, endMs: 1000, speaker: null, text: 'original', confidence: null }
      ]
    })
    expect(transcriptDisplayText(transcript)).toBe('texto corrigido pelo usuario')
  })

  it('skips blank segments and trims each segment before joining', () => {
    const transcript = buildTranscript({
      segments: [
        { id: '1', transcriptId: 't', startMs: 0, endMs: 500, speaker: null, text: '  primeiro  ', confidence: null },
        { id: '2', transcriptId: 't', startMs: 500, endMs: 500, speaker: null, text: '   ', confidence: null },
        { id: '3', transcriptId: 't', startMs: 500, endMs: 1000, speaker: null, text: 'segundo', confidence: null }
      ]
    })
    expect(transcriptDisplayText(transcript)).toBe('primeiro segundo')
  })

  it('returns an empty string when there are no segments and no edited text', () => {
    expect(transcriptDisplayText(buildTranscript())).toBe('')
  })
})
