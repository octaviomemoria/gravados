import type { WebPreferences } from 'electron'

/**
 * 03_TECHNICAL_ARCHITECTURE.md secao 4 + 09_SECURITY_PRIVACY_COMPLIANCE.md + AGENTS.md: unico
 * objeto webPreferences usado em toda BrowserWindow criada pelo app. Nenhuma excecao e necessaria
 * nesta fase - o renderer nunca precisa de acesso direto a Node/fs/processos; toda integracao
 * nativa passa por preload + contextBridge + IPC validado (ver MVP-AC-015).
 */
export function createSecureWebPreferences(preloadPath: string): WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: preloadPath,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false
  }
}
