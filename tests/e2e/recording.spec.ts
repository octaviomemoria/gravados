import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'

// Ver comentario detalhado em app-launch.spec.ts: o argumento e a raiz do projeto, nao o .js.
const APP_ROOT = process.cwd()
const MAIN_ENTRY = resolve(APP_ROOT, 'out/main/index.js')
const BUILD_MISSING_MESSAGE = 'Build ausente - rode "pnpm build" antes de "pnpm test:e2e".'

/**
 * Teste de ponta a ponta do primeiro incremento de captura real (somente microfone): usa o
 * dispositivo de audio sintetico do Chromium (`--use-fake-device-for-media-stream`, habilitado
 * via `MEETING_STUDIO_E2E_FAKE_MEDIA=1` - ver `main/index.ts`) para gravar de verdade sem
 * depender de hardware, e verifica que um arquivo de segmento nao-vazio foi persistido em disco.
 *
 * A variavel da janela do app e chamada `appWindow` (nao `window`) deliberadamente: o tipo global
 * `window.meetingStudio` (declarado em `src/renderer/global.d.ts`) precisa ser referenciado dentro
 * do callback de `evaluate()`, que roda no contexto do browser - nomear a variavel local `window`
 * sombrearia o `window` do DOM dentro desse callback e quebraria a checagem de tipos.
 */
test.describe('recording (microphone only)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [APP_ROOT],
      env: {
        ...process.env,
        MEETING_STUDIO_E2E_FAKE_MEDIA: '1',
        MEETING_STUDIO_LOG_LEVEL: 'error'
      }
    })
    appWindow = await electronApp.firstWindow()
    await appWindow.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('records microphone audio end-to-end and persists a non-empty segment file', async () => {
    await appWindow
      .getByRole('navigation', { name: 'Navegacao principal' })
      .getByRole('link', { name: 'Nova gravacao' })
      .click()

    // `getByLabel` faz correspondencia por substring por padrao - "Nivel do microfone" (aria-label
    // do medidor de nivel) tambem contem "microfone", entao exact:true e necessario aqui.
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: 15_000 })
    await micSelect.selectOption({ index: 1 })

    await appWindow.getByLabel('Titulo da reuniao').fill('Reuniao de teste E2E')
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()

    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })
    // Timeslice do MediaRecorder e de 1s - espera margem suficiente para pelo menos 1 chunk real.
    await appWindow.waitForTimeout(2_500)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: 15_000
    })

    const projects = await appWindow.evaluate(() => window.meetingStudio.library.list())
    expect(projects.length).toBeGreaterThan(0)
    const latest = projects[0]
    expect(latest?.status).toBe('COMPLETED')

    const segmentPath = join(latest!.rootPath, 'source', 'microphone', 'microphone_000001.webm')
    expect(existsSync(segmentPath)).toBe(true)
    expect(statSync(segmentPath).size).toBeGreaterThan(0)
  })
})
