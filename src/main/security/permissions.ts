import type { Session } from 'electron'

/**
 * RF-003/RF-004 (preview de camera/microfone) dependem de `getUserMedia()` no renderer, que so
 * resolve se o processo main conceder a permissao 'media' - sem isso a chamada fica pendente
 * indefinidamente (viola MVP-AC-014: "acesso negado -> orientacao, nunca travar"). Concede
 * automaticamente apenas 'media' (camera/mic) - qualquer outra permissao (geolocation,
 * notifications, etc.) e negada por padrao, minimizando superficie de risco
 * (09_SECURITY_PRIVACY_COMPLIANCE.md).
 */
export function registerMediaPermissionHandlers(session: Session): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  session.setPermissionCheckHandler((_webContents, permission) => permission === 'media')
}
