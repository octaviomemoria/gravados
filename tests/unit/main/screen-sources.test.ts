import { describe, it, expect } from 'vitest'
import { classifySourceKind } from '../../../src/main/media/screen-sources'

describe('classifySourceKind', () => {
  it('classifies "screen:ZZ:0" ids as screen', () => {
    expect(classifySourceKind('screen:0:0')).toBe('screen')
    expect(classifySourceKind('screen:12:0')).toBe('screen')
  })

  it('classifies "window:XX:YY" ids as window', () => {
    expect(classifySourceKind('window:456:0')).toBe('window')
    expect(classifySourceKind('window:456:1')).toBe('window')
  })
})
