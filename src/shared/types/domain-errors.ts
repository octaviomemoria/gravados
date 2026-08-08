/**
 * Erros de dominio (12_DEVELOPMENT_STANDARDS.md). Cada subclasse carrega um `code` estavel usado
 * pelo envelope IPC (`shared/contracts/channels.ts`) e traduzido para copy amigavel via
 * `shared/constants/error-messages.ts` - a interface nunca deve mostrar codigo cru ao usuario
 * (08_UX_FLOWS.md, secao "Erros").
 */

export abstract class DomainError extends Error {
  abstract readonly code: string
  readonly metadata?: Record<string, unknown>

  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.metadata = metadata
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR'
}

export class DiskSpaceError extends DomainError {
  readonly code = 'DISK_SPACE_ERROR'
}

export class DeviceUnavailableError extends DomainError {
  readonly code = 'DEVICE_UNAVAILABLE_ERROR'
}

export class PermissionDeniedError extends DomainError {
  readonly code = 'PERMISSION_DENIED_ERROR'
}

export class MediaFinalizeError extends DomainError {
  readonly code = 'MEDIA_FINALIZE_ERROR'
}

export class ExportFailedError extends DomainError {
  readonly code = 'EXPORT_FAILED_ERROR'
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND_ERROR'
}

/** Usado pelos handlers IPC de recording/export que ainda nao tem implementacao real nesta fase. */
export class NotImplementedError extends DomainError {
  readonly code = 'NOT_IMPLEMENTED'
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
