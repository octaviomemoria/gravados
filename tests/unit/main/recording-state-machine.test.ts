import { describe, it, expect } from 'vitest'
import {
  RecordingStateMachine,
  InvalidRecordingTransitionError
} from '../../../src/main/recording/recording-state-machine'

describe('RecordingStateMachine', () => {
  it('starts in IDLE', () => {
    expect(new RecordingStateMachine().getState()).toBe('IDLE')
  })

  it('allows the full happy path through to COMPLETED', () => {
    const machine = new RecordingStateMachine()
    machine.transitionTo('PREPARING')
    machine.transitionTo('RECORDING')
    machine.transitionTo('STOPPING')
    machine.transitionTo('FINALIZING')
    machine.transitionTo('COMPLETED')
    expect(machine.getState()).toBe('COMPLETED')
  })

  it('allows pause/resume cycles', () => {
    const machine = new RecordingStateMachine()
    machine.transitionTo('PREPARING')
    machine.transitionTo('RECORDING')
    machine.transitionTo('PAUSED')
    machine.transitionTo('RECORDING')
    machine.transitionTo('PAUSED')
    expect(machine.getState()).toBe('PAUSED')
  })

  it('supports the recovery path FINALIZING -> RECOVERABLE -> FINALIZING -> COMPLETED', () => {
    const machine = new RecordingStateMachine()
    machine.transitionTo('PREPARING')
    machine.transitionTo('RECORDING')
    machine.transitionTo('STOPPING')
    machine.transitionTo('FINALIZING')
    machine.transitionTo('RECOVERABLE')
    machine.transitionTo('FINALIZING')
    machine.transitionTo('COMPLETED')
    expect(machine.getState()).toBe('COMPLETED')
  })

  it('rejects an invalid transition', () => {
    const machine = new RecordingStateMachine()
    expect(() => machine.transitionTo('RECORDING')).toThrow(InvalidRecordingTransitionError)
  })

  it('rejects transitions out of terminal states', () => {
    const machine = new RecordingStateMachine()
    machine.transitionTo('PREPARING')
    machine.transitionTo('FAILED')
    expect(() => machine.transitionTo('RECORDING')).toThrow(InvalidRecordingTransitionError)
  })

  it('resets to IDLE', () => {
    const machine = new RecordingStateMachine()
    machine.transitionTo('PREPARING')
    machine.reset()
    expect(machine.getState()).toBe('IDLE')
  })
})
