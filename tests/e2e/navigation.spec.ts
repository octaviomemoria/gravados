import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// Ver comentario detalhado em app-launch.spec.ts: o argumento e a raiz do projeto, nao o .js.
const APP_ROOT = process.cwd()
const MAIN_ENTRY = resolve(APP_ROOT, 'out/main/index.js')
const BUILD_MISSING_MESSAGE = 'Build ausente - rode "pnpm build" antes de "pnpm test:e2e".'

test.describe('navigation', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)

  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({ args: [APP_ROOT] })
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  const routes: ReadonlyArray<{ label: string; heading: string }> = [
    { label: 'Nova gravacao', heading: 'Nova gravacao' },
    { label: 'Biblioteca', heading: 'Biblioteca' },
    { label: 'Projetos', heading: 'Projetos' },
    { label: 'Exportacoes', heading: 'Exportacoes' },
    { label: 'Configuracoes', heading: 'Configuracoes' },
    { label: 'Home', heading: 'Meeting Studio' }
  ]

  for (const route of routes) {
    test(`navigates to "${route.label}" without crashing and shows its expected content`, async () => {
      await window
        .getByRole('navigation', { name: 'Navegacao principal' })
        .getByRole('link', { name: route.label })
        .click()

      await expect(window.getByRole('heading', { name: route.heading })).toBeVisible()
    })
  }
})
