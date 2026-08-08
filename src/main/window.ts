import { BrowserWindow, session, app } from 'electron'
import { join } from 'node:path'
import { createSecureWebPreferences } from './security/secure-webpreferences'
import { applyContentSecurityPolicy } from './security/content-security-policy'
import { applyNavigationGuard } from './security/navigation-guard'
import { registerMediaPermissionHandlers } from './security/permissions'
import { APP_NAME } from '../shared/constants/app-info'

/** electron-vite define esta variavel de ambiente durante `electron-vite dev`. */
function isDevServerActive(): boolean {
  return !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
}

export function createMainWindow(): BrowserWindow {
  const isDev = isDevServerActive()
  applyContentSecurityPolicy(session.defaultSession, isDev)
  registerMediaPermissionHandlers(session.defaultSession)

  const preloadPath = join(__dirname, '../preload/index.js')

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: createSecureWebPreferences(preloadPath)
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL

  applyNavigationGuard(window.webContents, (url) => {
    if (isDev && rendererUrl) return url.startsWith(rendererUrl)
    return url.startsWith('file://')
  })

  if (isDev && rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
