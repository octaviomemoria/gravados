import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Roda o binario Electron real, buildado (`out/main/index.js`) - requer `pnpm build` antes de
 * `pnpm test:e2e` (mesma ordem do workflow de validacao em AGENTS.md/10_TESTING_QA.md).
 * `executablePath` nao e informado - o Playwright resolve automaticamente
 * `node_modules/.bin/electron`.
 *
 * O argumento passado e a RAIZ do projeto (onde `package.json`/`main` vivem), nao o arquivo
 * `out/main/index.js` diretamente: `app.getAppPath()` (usado por `services/app-paths.ts` para
 * localizar `src/main/database/migrations` fora de um build empacotado) so resolve para a raiz
 * correta quando o Electron encontra o `package.json` do app subindo a partir do argumento
 * recebido - passar o `.js` direto faz `getAppPath()` apontar para `out/main/`, quebrando o
 * caminho de migrations. Verificado empiricamente durante o bootstrap desta fase.
 */
const APP_ROOT = process.cwd()
const MAIN_ENTRY = resolve(APP_ROOT, 'out/main/index.js')
const BUILD_MISSING_MESSAGE = 'Build ausente - rode "pnpm build" antes de "pnpm test:e2e".'

test.describe('app launch', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)

  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [APP_ROOT],
      env: { ...process.env, MEETING_STUDIO_LOG_LEVEL: 'error' }
    })
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('opens a window with the correct title', async () => {
    await expect(window).toHaveTitle('Meeting Studio')
  })

  test('shows all documented sidebar navigation items (08_UX_FLOWS.md)', async () => {
    const nav = window.getByRole('navigation', { name: 'Navegacao principal' })
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Nova gravacao' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Biblioteca' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Projetos' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Exportacoes' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Configuracoes' })).toBeVisible()
  })

  test('produces zero console errors on load', async () => {
    const errors: string[] = []
    window.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    expect(errors).toEqual([])
  })

  test('creates the SQLite database file under userData on first launch', async () => {
    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    const dbPath = resolve(userDataPath, 'meeting-studio.db')
    expect(existsSync(dbPath)).toBe(true)
  })
})
