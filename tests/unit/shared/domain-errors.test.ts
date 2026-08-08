import { describe, it, expect } from 'vitest'
import {
  DiskSpaceError,
  DeviceUnavailableError,
  PermissionDeniedError,
  MediaFinalizeError,
  ExportFailedError,
  ValidationError,
  NotFoundError,
  NotImplementedError,
  isDomainError
} from '../../../src/shared/types/domain-errors'

describe('domain errors', () => {
  it('each documented error type carries a distinct, stable code', () => {
    const errors = [
      new DiskSpaceError('a'),
      new DeviceUnavailableError('b'),
      new PermissionDeniedError('c'),
      new MediaFinalizeError('d'),
      new ExportFailedError('e'),
      new ValidationError('f'),
      new NotFoundError('g'),
      new NotImplementedError('h')
    ]
    const codes = errors.map((error) => error.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('is recognized by isDomainError, plain Errors and non-errors are not', () => {
    expect(isDomainError(new DiskSpaceError('x'))).toBe(true)
    expect(isDomainError(new Error('plain'))).toBe(false)
    expect(isDomainError('not an error')).toBe(false)
  })

  it('preserves optional metadata', () => {
    const error = new DiskSpaceError('sem espaco', { freeBytes: 10 })
    expect(error.metadata).toEqual({ freeBytes: 10 })
  })
})
