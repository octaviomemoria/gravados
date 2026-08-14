import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'

// Ver comentario detalhado em app-launch.spec.ts: o argumento e a raiz do projeto, nao o .js.
const APP_ROOT = process.cwd()
const MAIN_ENTRY = resolve(APP_ROOT, 'out/main/index.js')
const BUILD_MISSING_MESSAGE = 'Build ausente - rode "pnpm build" antes de "pnpm test:e2e".'
const POLL_TIMEOUT_MS = 40_000
const SELECT_TIMEOUT_MS = 25_000
const EDITOR_TEST_TIMEOUT_MS = 90_000

function fileHasBytes(path: string): boolean {
  return existsSync(path) && statSync(path).size > 0
}

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [APP_ROOT],
    env: {
      ...process.env,
      MEETING_STUDIO_E2E_FAKE_MEDIA: '1',
      MEETING_STUDIO_LOG_LEVEL: 'error'
    }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  return { app, window }
}

async function openRecordingSetup(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegacao principal' })
    .getByRole('link', { name: 'Nova gravacao' })
    .click()
}

async function openLibrary(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegacao principal' })
    .getByRole('link', { name: 'Biblioteca' })
    .click()
}

async function openEditorList(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegacao principal' })
    .getByRole('link', { name: 'Projetos' })
    .click()
}

/**
 * EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). Arquivo proprio, mesmo padrao ja
 * registrado em `library.spec.ts` (decisao #54) - um arquivo por area de produto.
 *
 * Grava uma sessao real curta (so microfone) para ter uma gravacao `COMPLETED` de verdade, unico
 * pre-requisito para criar um projeto de edicao (`EditorService.createEditProject` rejeita
 * qualquer outro status).
 */
test.describe('editor (create and open edit project)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)
  test.describe.configure({ retries: 2 })

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeEach(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterEach(async () => {
    await electronApp.close()
  })

  test('creates an edit project from a completed recording via the Library and opens it from the editor list', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - editor ${Date.now()}`

    await openRecordingSetup(appWindow)
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })
    await appWindow.getByLabel('Titulo da reuniao').fill(title)
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const projects = await appWindow.evaluate(() => window.meetingStudio.library.list())
    const rootPath = projects[0]!.rootPath
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')
    await expect
      .poll(() => fileHasBytes(microphonePath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de audio ser persistido em disco'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    // --- Cria o projeto de edicao a partir da Biblioteca.
    await openLibrary(appWindow)
    const listItem = appWindow.locator('.library-list__item').filter({ hasText: title })
    await expect(listItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await listItem.getByRole('button', { name: 'Editar' }).click()

    // Navega para a pagina de detalhe do projeto de edicao (nome padrao = titulo da gravacao).
    await expect(appWindow.getByRole('heading', { name: title })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
    await expect(appWindow.getByText('Gravacao original:', { exact: false })).toContainText(title)

    // --- Volta para a lista geral de projetos de edicao e reabre o mesmo pela lista.
    await openEditorList(appWindow)
    const editListItem = appWindow.locator('.library-list__item').filter({ hasText: title })
    await expect(editListItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await editListItem.getByRole('link', { name: title }).click()
    await expect(appWindow.getByRole('heading', { name: title })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
  })

  test('rejects creating an edit project when the recording is not completed', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    // Projeto recem-criado, sem nenhuma gravacao real - status permanece IDLE, nunca COMPLETED.
    const result = await appWindow.evaluate(async () => {
      const project = await window.meetingStudio.project.create({
        title: `Reuniao de teste E2E - editor sem gravacao ${Date.now()}`
      })
      try {
        await window.meetingStudio.editor.create(project.id)
        return { rejected: false }
      } catch {
        return { rejected: true }
      }
    })
    expect(result.rejected).toBe(true)
  })
})

/**
 * EDIT-002 (decimo terceiro incremento - timeline). Descreve separado do de cima - exercita a
 * visualizacao da timeline (`Timeline.tsx`), nao mais so criar/abrir o projeto de edicao.
 */
test.describe('editor (timeline)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)
  test.describe.configure({ retries: 2 })

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeEach(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterEach(async () => {
    await electronApp.close()
  })

  test('shows a clip per recorded track after creating an edit project', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - timeline ${Date.now()}`

    await openRecordingSetup(appWindow)
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })
    const cameraSelect = appWindow.getByLabel('Camera', { exact: true })
    await expect(cameraSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await cameraSelect.selectOption({ index: 1 })
    await expect(appWindow.locator('video.camera-preview')).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })
    await appWindow.getByLabel('Titulo da reuniao').fill(title)
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const projects = await appWindow.evaluate(() => window.meetingStudio.library.list())
    const rootPath = projects[0]!.rootPath
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')
    const cameraPath = join(rootPath, 'source', 'camera', 'camera_000001.webm')
    await expect
      .poll(() => fileHasBytes(microphonePath) && fileHasBytes(cameraPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando os primeiros chunks de audio e video serem persistidos em disco'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    await openLibrary(appWindow)
    const listItem = appWindow.locator('.library-list__item').filter({ hasText: title })
    await expect(listItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await listItem.getByRole('button', { name: 'Editar' }).click()

    await expect(appWindow.getByRole('heading', { name: title })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
    // Duas trilhas (microfone + camera), cada uma com exatamente um clip (um segmento cada,
    // sem rotacao nesta gravacao curta).
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })
    await expect(appWindow.getByText('Microfone', { exact: true })).toBeVisible()
    await expect(appWindow.getByText('Câmera', { exact: true })).toBeVisible()
    await expect(appWindow.locator('.timeline__clip')).toHaveCount(2)
  })
})

/**
 * EDIT-003 (decimo quarto incremento - preview). Confirma que o `<video>` de preview carrega
 * dados REAIS servidos pelo esquema customizado `meeting-media://` (`main/media/media-protocol.ts`)
 * - nao so que o elemento existe no DOM, mas que o navegador conseguiu buscar/decodificar bytes
 * reais do arquivo no disco (via `videoWidth > 0`, que so fica positivo apos o primeiro frame
 * real ser decodificado - `duration` sozinho e um sinal menos confiavel aqui: WebM produzido por
 * `MediaRecorder` em chunks sucessivos costuma reportar `Infinity` ate o navegador escanear mais
 * do stream, um comportamento conhecido do Chromium, nao um bug deste app).
 */
test.describe('editor (preview)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)
  test.describe.configure({ retries: 2 })

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeEach(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterEach(async () => {
    await electronApp.close()
  })

  test('loads real video data through the custom media protocol', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - preview ${Date.now()}`

    await openRecordingSetup(appWindow)
    const cameraSelect = appWindow.getByLabel('Camera', { exact: true })
    await expect(cameraSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await cameraSelect.selectOption({ index: 1 })
    await expect(appWindow.locator('video.camera-preview')).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })
    await appWindow.getByLabel('Titulo da reuniao').fill(title)
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const projects = await appWindow.evaluate(() => window.meetingStudio.library.list())
    const rootPath = projects[0]!.rootPath
    const cameraPath = join(rootPath, 'source', 'camera', 'camera_000001.webm')
    await expect
      .poll(() => fileHasBytes(cameraPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de video ser persistido em disco'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    await openLibrary(appWindow)
    const listItem = appWindow.locator('.library-list__item').filter({ hasText: title })
    await expect(listItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await listItem.getByRole('button', { name: 'Editar' }).click()
    await expect(appWindow.getByRole('heading', { name: title })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })

    const video = appWindow.locator('video.editor-preview')
    await expect(video).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await appWindow.waitForFunction(
      () => {
        const element = document.querySelector('video.editor-preview') as HTMLVideoElement | null
        return !!element && element.readyState >= 1 && element.videoWidth > 0
      },
      { timeout: POLL_TIMEOUT_MS }
    )
  })
})
