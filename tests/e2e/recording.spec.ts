import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'

// Ver comentario detalhado em app-launch.spec.ts: o argumento e a raiz do projeto, nao o .js.
const APP_ROOT = process.cwd()
const MAIN_ENTRY = resolve(APP_ROOT, 'out/main/index.js')
const BUILD_MISSING_MESSAGE = 'Build ausente - rode "pnpm build" antes de "pnpm test:e2e".'

function fileHasBytes(path: string): boolean {
  return existsSync(path) && statSync(path).size > 0
}

/**
 * Teste de ponta a ponta da captura real (microfone + camera simultaneos, terceiro incremento):
 * usa os dispositivos sinteticos de audio/video do Chromium
 * (`--use-fake-device-for-media-stream`, habilitado via `MEETING_STUDIO_E2E_FAKE_MEDIA=1` - ver
 * `main/index.ts`) para gravar de verdade sem depender de hardware, e verifica que os DOIS
 * arquivos de segmento (um por trilha) foram persistidos em disco.
 *
 * A variavel da janela do app e chamada `appWindow` (nao `window`) deliberadamente: o tipo global
 * `window.meetingStudio` (declarado em `src/renderer/global.d.ts`) precisa ser referenciado dentro
 * do callback de `evaluate()`, que roda no contexto do browser - nomear a variavel local `window`
 * sombrearia o `window` do DOM dentro desse callback e quebraria a checagem de tipos.
 *
 * Espera pela condicao REAL (arquivo de segmento com bytes no disco) via `expect.poll` em vez de
 * um `waitForTimeout` fixo - o timeslice do MediaRecorder e de ~1s, mas sob carga de sistema
 * variavel um tempo fixo curto e uma fonte real de flakiness observada durante o desenvolvimento.
 */
test.describe('recording (microphone + camera)', () => {
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

  test('records microphone and camera end-to-end and persists two non-empty segment files', async () => {
    await appWindow
      .getByRole('navigation', { name: 'Navegacao principal' })
      .getByRole('link', { name: 'Nova gravacao' })
      .click()

    // `getByLabel` faz correspondencia por substring por padrao - "Nivel do microfone" (aria-label
    // do medidor de nivel) tambem contem "microfone", entao exact:true e necessario aqui.
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: 15_000 })
    await micSelect.selectOption({ index: 1 })

    const cameraSelect = appWindow.getByLabel('Camera', { exact: true })
    await expect(cameraSelect).toBeVisible({ timeout: 15_000 })
    await cameraSelect.selectOption({ index: 1 })

    await appWindow.getByLabel('Titulo da reuniao').fill('Reuniao de teste E2E')
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()

    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    // O projeto ja foi criado nesse ponto (recording.start ja retornou) - descobre o caminho dos
    // arquivos de segmento para poder observar a condicao real, em vez de adivinhar um tempo.
    const projectsDuringRecording = await appWindow.evaluate(() => window.meetingStudio.library.list())
    const activeProject = projectsDuringRecording[0]
    expect(activeProject).toBeTruthy()

    const microphonePath = join(
      activeProject!.rootPath,
      'source',
      'microphone',
      'microphone_000001.webm'
    )
    const cameraPath = join(activeProject!.rootPath, 'source', 'camera', 'camera_000001.webm')

    await expect
      .poll(() => fileHasBytes(microphonePath), {
        timeout: 20_000,
        message: 'aguardando primeiro chunk de audio ser persistido em disco'
      })
      .toBe(true)
    await expect
      .poll(() => fileHasBytes(cameraPath), {
        timeout: 20_000,
        message: 'aguardando primeiro chunk de video ser persistido em disco'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: 15_000
    })

    const projects = await appWindow.evaluate(() => window.meetingStudio.library.list())
    const latest = projects[0]
    expect(latest?.status).toBe('COMPLETED')
    expect(fileHasBytes(microphonePath)).toBe(true)
    expect(fileHasBytes(cameraPath)).toBe(true)
  })
})
