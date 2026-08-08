import log from 'electron-log/main'

/** Espelha `Logger.LogLevel` de electron-log (uniao estruturalmente identica). */
export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly'

/**
 * Campos estruturados documentados (12_DEVELOPMENT_STANDARDS.md). Por ser um tipo fechado (nao
 * `Record<string, unknown>`), e estruturalmente impossivel logar um campo livre como `apiKey` ou
 * `transcriptText` atraves deste helper - reforca 09_SECURITY_PRIVACY_COMPLIANCE.md ("nunca logar
 * segredos, tokens, ou conteudo de midia/transcricao") no nivel de tipo, nao so por convencao.
 */
export interface LogFields {
  projectId?: string
  trackId?: string
  segmentId?: string
  jobId?: string
  operation?: string
  durationMs?: number
  errorCode?: string
}

export interface ScopedLogger {
  info: (message: string, fields?: LogFields) => void
  warn: (message: string, fields?: LogFields) => void
  error: (message: string, fields?: LogFields) => void
  debug: (message: string, fields?: LogFields) => void
}

export function createScopedLogger(scope: string): ScopedLogger {
  const scoped = log.scope(scope)
  return {
    info: (message, fields) => scoped.info(message, fields ?? {}),
    warn: (message, fields) => scoped.warn(message, fields ?? {}),
    error: (message, fields) => scoped.error(message, fields ?? {}),
    debug: (message, fields) => scoped.debug(message, fields ?? {})
  }
}

export function configureLogger(logLevel: LogLevel): void {
  log.transports.file.level = logLevel
  log.transports.console.level = logLevel
}
