import type { Session } from 'electron'

const PROD_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'"
]

// HMR do Vite em dev precisa de websocket local e de eval controlado pelo proprio bundler.
const DEV_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "object-src 'none'",
  "base-uri 'self'"
]

export function buildContentSecurityPolicy(isDev: boolean): string {
  return (isDev ? DEV_CSP_DIRECTIVES : PROD_CSP_DIRECTIVES).join('; ')
}

/**
 * Aplicada via `session.webRequest.onHeadersReceived` (main process) em vez de uma tag
 * `<meta http-equiv="Content-Security-Policy">` no HTML - sobrevive a adulteracao do HTML do
 * renderer e cobre todas as respostas da sessao, nao so o documento principal.
 */
export function applyContentSecurityPolicy(session: Session, isDev: boolean): void {
  const csp = buildContentSecurityPolicy(isDev)
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}
