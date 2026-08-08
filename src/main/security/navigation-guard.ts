import { shell, type WebContents } from 'electron'

const ALLOWED_EXTERNAL_SCHEMES = ['https:', 'http:']

/**
 * Bloqueia navegacao para fora da origem do app e abertura de popups (09_SECURITY_...md:
 * "bloquear navegacao nao autorizada" / "bloquear abertura arbitraria de URLs"). O predicado
 * `isAllowedUrl` e responsabilidade de quem cria a janela (`main/window.ts`), que sabe se esta em
 * dev (servidor Vite) ou producao (arquivo local).
 */
export function applyNavigationGuard(
  webContents: WebContents,
  isAllowedUrl: (url: string) => boolean
): void {
  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault()
    }
  })

  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

export function isExternalUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_EXTERNAL_SCHEMES.includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Preparado para uso futuro (ex.: link "Documentacao" nas Configuracoes) - nao usado pela UI
 * nesta fase. Nunca chamar com uma URL vinda de dado nao confiavel sem validar o esquema antes.
 */
export async function openExternalSafely(url: string): Promise<boolean> {
  if (!isExternalUrlAllowed(url)) return false
  await shell.openExternal(url)
  return true
}
