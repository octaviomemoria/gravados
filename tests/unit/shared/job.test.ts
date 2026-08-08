import { describe, it, expect } from 'vitest'
import { canTransitionJob, JOB_STATUSES } from '../../../src/shared/types/job'

describe('job status transitions', () => {
  it('has exactly the 5 documented statuses', () => {
    expect(JOB_STATUSES).toEqual(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED'])
  })

  it('allows QUEUED -> RUNNING -> COMPLETED', () => {
    expect(canTransitionJob('QUEUED', 'RUNNING')).toBe(true)
    expect(canTransitionJob('RUNNING', 'COMPLETED')).toBe(true)
  })

  it('rejects transitions out of terminal statuses', () => {
    expect(canTransitionJob('COMPLETED', 'RUNNING')).toBe(false)
    expect(canTransitionJob('FAILED', 'RUNNING')).toBe(false)
    expect(canTransitionJob('CANCELED', 'RUNNING')).toBe(false)
  })
})
