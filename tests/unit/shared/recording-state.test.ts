import { describe, it, expect } from 'vitest'
import {
  canTransition,
  isTerminalState,
  RECORDING_STATES
} from '../../../src/shared/types/recording-state'

describe('recording-state', () => {
  it('has exactly the 9 documented states, in AGENTS.md order', () => {
    expect(RECORDING_STATES).toEqual([
      'IDLE',
      'PREPARING',
      'RECORDING',
      'PAUSED',
      'STOPPING',
      'FINALIZING',
      'COMPLETED',
      'RECOVERABLE',
      'FAILED'
    ])
  })

  it('allows IDLE -> PREPARING', () => {
    expect(canTransition('IDLE', 'PREPARING')).toBe(true)
  })

  it('rejects IDLE -> RECORDING (must go through PREPARING)', () => {
    expect(canTransition('IDLE', 'RECORDING')).toBe(false)
  })

  it('treats COMPLETED and FAILED as terminal, RECORDING as not', () => {
    expect(isTerminalState('COMPLETED')).toBe(true)
    expect(isTerminalState('FAILED')).toBe(true)
    expect(isTerminalState('RECORDING')).toBe(false)
  })
})
