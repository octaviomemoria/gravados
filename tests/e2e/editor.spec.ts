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

/**
 * EDIT-003 parte 2 (decimo sexto incremento - playhead sincronizado + multi-trilha). Grava
 * camera + microfone (uma trilha de video, uma de audio) para provar o requisito central deste
 * incremento: as DUAS trilhas avancam JUNTAS quando o usuario aperta "Reproduzir" (nao so a
 * trilha escolhida para o preview visual), "Pausar" congela ambas, e buscar (clicar na regua da
 * timeline) resincroniza as duas ao mesmo instante. Limiares de tempo propositalmente frouxos
 * (a gravacao real dura so ~1-2s neste ambiente de teste - fake media device + parar assim que o
 * primeiro chunk aparece) - o objetivo e provar o COMPORTAMENTO (avanca / congela / resincroniza
 * junto), nao validar matematica de proporcao exata contra uma gravacao tao curta.
 */
test.describe('editor (playback)', () => {
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

  test('plays, pauses, and seeks multiple tracks in lockstep', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - playback ${Date.now()}`

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
    // Espera um pouco mais antes de parar - o objetivo deste teste e provar SINCRONIZACAO entre
    // trilhas avancando de verdade, o que precisa de uma janela de conteudo real com folga (o
    // primeiro chunk sozinho pode render um clip de so alguns milissegundos de largura sob
    // contencao de maquina, estreito demais pra qualquer limiar de avanco fazer sentido).
    await appWindow.waitForTimeout(1500)

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
    // A trilha de audio (microfone) nao tem elemento visual proprio de proposito (nunca tem
    // imagem) - ver comentario em `EditorProjectPage.tsx`.
    const hiddenAudio = appWindow.locator('audio[data-track-type="MICROPHONE"]')
    await expect(hiddenAudio).toBeAttached()

    // --- Reproduzir: as duas trilhas avancam JUNTAS, nao so a exibida no preview. Limiar de
    // avanco propositalmente pequeno (10ms) - o objetivo e provar que AMBAS avancam juntas, nao
    // validar matematica de proporcao exata contra uma gravacao curta.
    const playButton = appWindow.getByRole('button', { name: 'Reproduzir' })
    await expect(playButton).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await playButton.click()
    await expect(appWindow.getByRole('button', { name: 'Pausar' })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
    await appWindow.waitForFunction(
      () => {
        const v = document.querySelector('video.editor-preview') as HTMLVideoElement | null
        const a = document.querySelector(
          'audio[data-track-type="MICROPHONE"]'
        ) as HTMLAudioElement | null
        return !!v && !!a && v.currentTime > 0.01 && a.currentTime > 0.01
      },
      { timeout: POLL_TIMEOUT_MS }
    )

    // --- Pausar: o instante congela (nao continua avancando sozinho).
    await appWindow.getByRole('button', { name: 'Pausar' }).click()
    await expect(playButton).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    const frozenAt = await video.evaluate((el: HTMLVideoElement) => el.currentTime)
    await appWindow.waitForTimeout(400)
    const stillFrozenAt = await video.evaluate((el: HTMLVideoElement) => el.currentTime)
    expect(stillFrozenAt).toBeCloseTo(frozenAt, 1)

    // --- Buscar (clicar perto do inicio da regua): as duas trilhas voltam JUNTAS.
    await appWindow.locator('.timeline__ruler').click({ position: { x: 2, y: 5 } })
    await appWindow.waitForFunction(
      () => {
        const v = document.querySelector('video.editor-preview') as HTMLVideoElement | null
        const a = document.querySelector(
          'audio[data-track-type="MICROPHONE"]'
        ) as HTMLAudioElement | null
        return !!v && !!a && v.currentTime < 0.5 && a.currentTime < 0.5
      },
      { timeout: POLL_TIMEOUT_MS }
    )
  })
})

/**
 * EDIT-004/005/006 (decimo setimo incremento - primeira operacao de edicao real). Confirma
 * "Cortar antes daqui" (trim inicio) e o fluxo de selecao manual (marcar inicio/fim + "Remover
 * trecho selecionado") de ponta a ponta - clique na UI ate a timeline editada refletir o corte.
 * Verificacao via `window.meetingStudio.editor.getEditedTimeline` (chamada direta pela API, mesmo
 * padrao ja usado em outros testes para evitar depender de parsing fragil de texto na tela) em
 * vez de matematica de proporcao exata contra uma gravacao curta - o objetivo e provar que o
 * clique realmente chega no IPC e volta refletido na timeline, nao validar milissegundos exatos.
 */
test.describe('editor (trim/remove-range)', () => {
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

  test('trims the start and then removes a manually marked selection', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - trim ${Date.now()}`

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
    // Mesma folga usada no teste de playback - uma janela de conteudo maior deixa margem real
    // pra cortar um pedaco do inicio sem que o resultado vire uma timeline vazia/zero.
    await appWindow.waitForTimeout(1500)

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

    const editProjectId = await appWindow.evaluate(async () => {
      const list = await window.meetingStudio.editor.list()
      return list[0]!.id
    })
    const before = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(before.totalDurationMs).toBeGreaterThan(0)

    // --- Reproduz um pouco, pausa, e corta tudo ANTES do playhead ("Cortar antes daqui").
    await appWindow.getByRole('button', { name: 'Reproduzir' }).click()
    await appWindow.waitForFunction(
      () => {
        const v = document.querySelector('video.editor-preview') as HTMLVideoElement | null
        return !!v && v.currentTime > 0.05
      },
      { timeout: POLL_TIMEOUT_MS }
    )
    await appWindow.getByRole('button', { name: 'Pausar' }).click()
    await appWindow.getByRole('button', { name: 'Cortar antes daqui' }).click()

    // O botao "Cortar antes daqui" fica desabilitado assim que o playhead volta pro zero (efeito
    // do proprio corte, ver `EditorProjectPage.tsx`) - esperar por isso confirma que o pedido
    // IPC completou e a timeline editada foi substituida na tela.
    await expect(appWindow.getByRole('button', { name: 'Cortar antes daqui' })).toBeDisabled({
      timeout: POLL_TIMEOUT_MS
    })
    await expect(appWindow.locator('.editor-edit-controls__error')).toHaveCount(0)

    const afterTrim = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(afterTrim.totalDurationMs).toBeLessThan(before.totalDurationMs)
    expect(afterTrim.totalDurationMs).toBeGreaterThan(0)

    // --- Marca uma selecao manual (inicio no zero, fim depois de reproduzir um pouco) e remove.
    await appWindow.getByRole('button', { name: 'Marcar inicio da selecao' }).click()
    await appWindow.getByRole('button', { name: 'Reproduzir' }).click()
    await appWindow.waitForFunction(
      () => {
        const v = document.querySelector('video.editor-preview') as HTMLVideoElement | null
        return !!v && v.currentTime > 0.05
      },
      { timeout: POLL_TIMEOUT_MS }
    )
    await appWindow.getByRole('button', { name: 'Pausar' }).click()
    await appWindow.getByRole('button', { name: 'Marcar fim da selecao' }).click()
    await expect(appWindow.locator('.editor-edit-controls__selection')).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })

    const removeButton = appWindow.getByRole('button', { name: 'Remover trecho selecionado' })
    await expect(removeButton).toBeEnabled({ timeout: POLL_TIMEOUT_MS })
    await removeButton.click()
    await expect(removeButton).toBeDisabled({ timeout: POLL_TIMEOUT_MS })
    await expect(appWindow.locator('.editor-edit-controls__error')).toHaveCount(0)

    const afterSelection = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(afterSelection.totalDurationMs).toBeLessThan(afterTrim.totalDurationMs)
  })
})

/**
 * EDIT-007 (decimo oitavo incremento - desfazer/refazer). Confirma o botao "Desfazer" (e o atalho
 * Ctrl+Z) revertendo um corte, "Refazer" reaplicando, e que criar uma operacao NOVA depois de um
 * undo desabilita "Refazer" (o ramo antigo foi podado - ver `EditorService.removeRange`).
 */
test.describe('editor (undo/redo)', () => {
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

  test('undoes and redoes a cut via buttons and the Ctrl+Z shortcut', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - undo ${Date.now()}`

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
    await appWindow.waitForTimeout(1500)

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

    const editProjectId = await appWindow.evaluate(async () => {
      const list = await window.meetingStudio.editor.list()
      return list[0]!.id
    })
    const original = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(original.canUndo).toBe(false)

    // --- Desfazer/Refazer comecam desabilitados (nada pra desfazer/refazer ainda).
    const undoButton = appWindow.getByRole('button', { name: 'Desfazer' })
    const redoButton = appWindow.getByRole('button', { name: 'Refazer' })
    await expect(undoButton).toBeDisabled({ timeout: POLL_TIMEOUT_MS })
    await expect(redoButton).toBeDisabled({ timeout: POLL_TIMEOUT_MS })

    // --- Corta um trecho (trim inicio) - "Desfazer" fica habilitado, "Refazer" continua nao.
    await appWindow.getByRole('button', { name: 'Reproduzir' }).click()
    await appWindow.waitForFunction(
      () => {
        const v = document.querySelector('video.editor-preview') as HTMLVideoElement | null
        return !!v && v.currentTime > 0.05
      },
      { timeout: POLL_TIMEOUT_MS }
    )
    await appWindow.getByRole('button', { name: 'Pausar' }).click()
    await appWindow.getByRole('button', { name: 'Cortar antes daqui' }).click()
    await expect(undoButton).toBeEnabled({ timeout: POLL_TIMEOUT_MS })
    await expect(redoButton).toBeDisabled({ timeout: POLL_TIMEOUT_MS })

    const afterCut = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(afterCut.totalDurationMs).toBeLessThan(original.totalDurationMs)

    // --- Desfazer (clique no botao) - volta pra duracao original, "Refazer" fica habilitado.
    await undoButton.click()
    await expect(redoButton).toBeEnabled({ timeout: POLL_TIMEOUT_MS })
    await expect(undoButton).toBeDisabled({ timeout: POLL_TIMEOUT_MS })
    const afterUndo = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(afterUndo.totalDurationMs).toBe(original.totalDurationMs)

    // --- Refazer (atalho Ctrl+Shift+Z) - reaplica o corte.
    await appWindow.keyboard.down('Control')
    await appWindow.keyboard.down('Shift')
    await appWindow.keyboard.press('z')
    await appWindow.keyboard.up('Shift')
    await appWindow.keyboard.up('Control')
    await expect(undoButton).toBeEnabled({ timeout: POLL_TIMEOUT_MS })
    await expect(redoButton).toBeDisabled({ timeout: POLL_TIMEOUT_MS })
    const afterRedo = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(afterRedo.totalDurationMs).toBe(afterCut.totalDurationMs)

    // --- Desfazer de novo (atalho Ctrl+Z), depois um corte NOVO - poda o "refazer" pendente.
    await appWindow.keyboard.down('Control')
    await appWindow.keyboard.press('z')
    await appWindow.keyboard.up('Control')
    await expect(redoButton).toBeEnabled({ timeout: POLL_TIMEOUT_MS })

    await appWindow.getByRole('button', { name: 'Reproduzir' }).click()
    await appWindow.waitForFunction(
      () => {
        const v = document.querySelector('video.editor-preview') as HTMLVideoElement | null
        return !!v && v.currentTime > 0.05
      },
      { timeout: POLL_TIMEOUT_MS }
    )
    await appWindow.getByRole('button', { name: 'Pausar' }).click()
    await appWindow.getByRole('button', { name: 'Cortar antes daqui' }).click()
    await expect(undoButton).toBeEnabled({ timeout: POLL_TIMEOUT_MS })
    await expect(redoButton).toBeDisabled({ timeout: POLL_TIMEOUT_MS })
  })
})

/**
 * EDIT-008 (decimo nono incremento - Fase 3, ganho/mudo). Grava microfone + camera (duas trilhas
 * independentes) para confirmar que mutar/ajustar o ganho de UMA trilha nao afeta a outra -
 * verificado via chamada direta a `editor.getEditedTimeline` (mesmo padrao ja estabelecido pelos
 * testes de corte/undo/redo), nao por inspecao de audio real.
 */
test.describe('editor (gain/mute)', () => {
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

  test('mutes and adjusts gain per track independently, via the mute button and the gain slider', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - gain ${Date.now()}`

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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })

    const editProjectId = await appWindow.evaluate(async () => {
      const list = await window.meetingStudio.editor.list()
      return list[0]!.id
    })
    const original = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(original.tracks.every((track) => track.gainDb === 0 && !track.muted)).toBe(true)

    // --- Muta a trilha de MICROFONE (primeiro rotulo na coluna de trilhas) via o botao de mudo.
    const micTrackRow = appWindow.locator('.timeline__track').filter({ hasText: 'Microfone' })
    await micTrackRow.getByRole('button', { name: 'Silenciar trilha' }).click()

    const afterMute = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const micTrackAfterMute = afterMute.tracks.find((track) => track.type === 'MICROPHONE')!
    const cameraTrackAfterMute = afterMute.tracks.find((track) => track.type === 'CAMERA')!
    expect(micTrackAfterMute.muted).toBe(true)
    expect(cameraTrackAfterMute.muted).toBe(false)
    await expect(micTrackRow.getByRole('button', { name: 'Reativar som' })).toBeVisible()

    // --- Ajusta o ganho da trilha de CAMERA via o slider (bypassa o rastreador de valor do React
    // usando o setter nativo, mesma tecnica padrao para simular um `<input>` controlado mudando de
    // valor por script em vez de arrasto real de mouse).
    const cameraTrackRow = appWindow.locator('.timeline__track').filter({ hasText: 'Câmera' })
    // Rotulo especifico (nao um seletor generico `input[type="range"]`) - desde EDIT-010 a linha
    // da trilha CAMERA tambem tem os sliders de posicao/tamanho, entao um seletor generico
    // resolveria a MULTIPLOS elementos (violacao do strict mode do Playwright).
    const cameraSlider = cameraTrackRow.getByLabel('Ganho da trilha Câmera')
    await cameraSlider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, '-24')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const afterGain = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const cameraTrackAfterGain = afterGain.tracks.find((track) => track.type === 'CAMERA')!
    const micTrackAfterGain = afterGain.tracks.find((track) => track.type === 'MICROPHONE')!
    expect(cameraTrackAfterGain.gainDb).toBe(-24)
    expect(cameraTrackAfterGain.muted).toBe(false)
    // Mudo do microfone continua intacto - ajustar o ganho de OUTRA trilha nao interfere.
    expect(micTrackAfterGain.muted).toBe(true)
    expect(micTrackAfterGain.gainDb).toBe(0)

    // --- Desfazer (Ctrl+Z) reverte so a ULTIMA operacao do log (o ajuste de ganho da camera) -
    // o mudo do microfone, uma operacao anterior no log, continua ativo.
    await appWindow.keyboard.down('Control')
    await appWindow.keyboard.press('z')
    await appWindow.keyboard.up('Control')
    const afterUndo = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const cameraTrackAfterUndo = afterUndo.tracks.find((track) => track.type === 'CAMERA')!
    const micTrackAfterUndo = afterUndo.tracks.find((track) => track.type === 'MICROPHONE')!
    expect(cameraTrackAfterUndo.gainDb).toBe(0)
    expect(micTrackAfterUndo.muted).toBe(true)
  })
})

/**
 * EDIT-009 (vigesimo incremento - Fase 3, fade in/out). Mesmo padrao do teste de gain/mute:
 * grava microfone + camera, ajusta fade-in/fade-out de UMA trilha via os campos numericos e
 * confirma via `editor.getEditedTimeline` que a outra trilha nao e afetada.
 */
test.describe('editor (fade)', () => {
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

  test('sets fade-in/fade-out per track independently, via the numeric fields', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - fade ${Date.now()}`

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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })

    const editProjectId = await appWindow.evaluate(async () => {
      const list = await window.meetingStudio.editor.list()
      return list[0]!.id
    })

    // --- Ajusta fade-in (2s) e fade-out (1.5s) da trilha de MICROFONE via os campos numericos.
    const micTrackRow = appWindow.locator('.timeline__track').filter({ hasText: 'Microfone' })
    const micFadeInInput = micTrackRow.getByLabel('Fade-in da trilha Microfone (segundos)')
    const micFadeOutInput = micTrackRow.getByLabel('Fade-out da trilha Microfone (segundos)')
    await micFadeInInput.fill('2')
    // Espera o primeiro ajuste completar o round-trip IPC + re-render ANTES do segundo - o
    // handler do segundo campo le `track.fadeInMs` do estado React atual no momento do evento
    // (closure), entao disparar os dois `.fill()` de volta sem esperar arriscaria capturar o
    // valor ANTIGO (0) se o primeiro `setTrackFade` ainda estivesse em voo.
    await expect
      .poll(
        async () => {
          const current = await appWindow.evaluate(
            (id) => window.meetingStudio.editor.getEditedTimeline(id),
            editProjectId
          )
          return current.tracks.find((track) => track.type === 'MICROPHONE')?.fadeInMs
        },
        { timeout: POLL_TIMEOUT_MS }
      )
      .toBe(2000)
    await micFadeOutInput.fill('1.5')

    const afterFade = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const micTrackAfterFade = afterFade.tracks.find((track) => track.type === 'MICROPHONE')!
    const cameraTrackAfterFade = afterFade.tracks.find((track) => track.type === 'CAMERA')!
    expect(micTrackAfterFade.fadeInMs).toBe(2000)
    expect(micTrackAfterFade.fadeOutMs).toBe(1500)
    // Camera nao foi tocada - fade e independente por trilha, igual ganho/mudo (EDIT-008).
    expect(cameraTrackAfterFade.fadeInMs).toBe(0)
    expect(cameraTrackAfterFade.fadeOutMs).toBe(0)

    // --- Desfazer (Ctrl+Z) reverte so a ULTIMA operacao do log (o fade-out, a segunda mudanca) -
    // o fade-in continua ativo (a primeira mudanca), confirmando que sao a mesma operacao
    // SUBSTITUINDO o estado inteiro da trilha a cada chamada (nao acumulando fade-in e fade-out
    // como operacoes separadas). Tira o foco do campo de fade-out ANTES do atalho - o listener
    // global de teclado ignora Ctrl+Z/Ctrl+Shift+Z com o foco em qualquer `<input>` (guard
    // deliberado documentado em `EditorProjectPage`), e `.fill()` deixa o campo focado.
    await micFadeOutInput.blur()
    await appWindow.keyboard.down('Control')
    await appWindow.keyboard.press('z')
    await appWindow.keyboard.up('Control')
    const afterUndo = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const micTrackAfterUndo = afterUndo.tracks.find((track) => track.type === 'MICROPHONE')!
    expect(micTrackAfterUndo.fadeInMs).toBe(2000)
    expect(micTrackAfterUndo.fadeOutMs).toBe(0)
  })
})

/**
 * EDIT-010 (vigesimo primeiro incremento - Fase 3, visibilidade/transformacao de camera). Mesmo
 * padrao dos testes de gain/fade: grava microfone + camera, confirma que os controles de
 * transformacao SO aparecem na trilha CAMERA (nunca na de microfone), ajusta visibilidade e
 * posicao X via a UI, confirma via `editor.getEditedTimeline` e que Ctrl+Z desfaz so a ULTIMA
 * operacao (mesma semantica de "substitui, nao acumula" do EDIT-008/009).
 */
test.describe('editor (camera transform)', () => {
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

  test('adjusts camera visibility and position, and confirms the controls only appear on the CAMERA track', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - transform ${Date.now()}`

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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })

    const editProjectId = await appWindow.evaluate(async () => {
      const list = await window.meetingStudio.editor.list()
      return list[0]!.id
    })
    const original = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const cameraTrackOriginal = original.tracks.find((track) => track.type === 'CAMERA')!
    const micTrackOriginal = original.tracks.find((track) => track.type === 'MICROPHONE')!
    // Trilha CAMERA nasce com a posicao PiP padrao; qualquer outro tipo de trilha nao tem posicao.
    expect(cameraTrackOriginal.cameraTransform).toMatchObject({ visible: true, xPercent: 70 })
    expect(micTrackOriginal.cameraTransform).toBeNull()

    // --- Os controles de transformacao (checkbox "Mostrar camera" + sliders) so existem na linha
    // da trilha CAMERA, nunca na de MICROFONE - posicao/tamanho nao fazem sentido pra audio.
    const cameraTrackRow = appWindow.locator('.timeline__track').filter({ hasText: 'Câmera' })
    const micTrackRow = appWindow.locator('.timeline__track').filter({ hasText: 'Microfone' })
    const visibleCheckbox = cameraTrackRow.getByLabel('Mostrar camera da trilha Câmera')
    await expect(visibleCheckbox).toBeVisible()
    await expect(micTrackRow.getByLabel(/Mostrar camera/)).toHaveCount(0)

    // --- Desliga a visibilidade da camera (desmarca o checkbox) - primeira operacao.
    await visibleCheckbox.uncheck()
    await expect
      .poll(
        async () => {
          const current = await appWindow.evaluate(
            (id) => window.meetingStudio.editor.getEditedTimeline(id),
            editProjectId
          )
          return current.tracks.find((track) => track.type === 'CAMERA')?.cameraTransform?.visible
        },
        { timeout: POLL_TIMEOUT_MS }
      )
      .toBe(false)

    // --- Ajusta a posicao X via o slider (setter nativo bypassando o rastreador de valor do
    // React, mesma tecnica ja usada pelo slider de ganho do EDIT-008) - segunda operacao,
    // SUBSTITUI o estado inteiro (preserva `visible: false` da operacao anterior, ja que o
    // handler mescla com o `transform` atual antes de enviar).
    const xSlider = cameraTrackRow.getByLabel('Posicao X da camera da trilha Câmera (porcentagem)')
    await xSlider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, '40')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const afterTransform = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const cameraTrackAfterTransform = afterTransform.tracks.find((track) => track.type === 'CAMERA')!
    const micTrackAfterTransform = afterTransform.tracks.find((track) => track.type === 'MICROPHONE')!
    expect(cameraTrackAfterTransform.cameraTransform).toMatchObject({ visible: false, xPercent: 40 })
    // Microfone nunca teve (nem pode ter) uma transformacao de camera.
    expect(micTrackAfterTransform.cameraTransform).toBeNull()

    // --- Desfazer (Ctrl+Z) reverte so a ULTIMA operacao do log (o ajuste de X) - a visibilidade
    // desligada, uma operacao anterior, continua ativa. O checkbox ganha foco real ao ser clicado
    // (ao contrario do slider ajustado via `.evaluate()` acima) - tira o foco antes do atalho,
    // mesmo raciocinio ja documentado no teste de fade (EDIT-009).
    await visibleCheckbox.blur()
    await appWindow.keyboard.down('Control')
    await appWindow.keyboard.press('z')
    await appWindow.keyboard.up('Control')
    const afterUndo = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    const cameraTrackAfterUndo = afterUndo.tracks.find((track) => track.type === 'CAMERA')!
    expect(cameraTrackAfterUndo.cameraTransform).toMatchObject({ visible: false, xPercent: 70 })
  })
})

/**
 * EDIT-011 (vigesimo segundo incremento - Fase 3, layout da composicao). Ao contrario de todos os
 * testes anteriores desta familia, `SET_LAYOUT` nao mira uma trilha - confirma que o select de
 * layout troca o preset da composicao INTEIRA (`editor.getEditedTimeline().layoutPreset`), que o
 * padrao e `PIP`, e que Ctrl+Z desfaz so a ULTIMA troca.
 */
test.describe('editor (layout)', () => {
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

  test('switches the composition layout preset via the select, defaults to PIP, and undoes only the last change', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - layout ${Date.now()}`

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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })

    const editProjectId = await appWindow.evaluate(async () => {
      const list = await window.meetingStudio.editor.list()
      return list[0]!.id
    })
    const original = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(original.layoutPreset).toBe('PIP')

    // --- Troca pra "So camera" pelo select - primeira operacao.
    const layoutSelect = appWindow.getByLabel('Layout')
    await expect(layoutSelect).toBeVisible()
    await layoutSelect.selectOption('CAMERA_ONLY')
    await expect
      .poll(
        async () => {
          const current = await appWindow.evaluate(
            (id) => window.meetingStudio.editor.getEditedTimeline(id),
            editProjectId
          )
          return current.layoutPreset
        },
        { timeout: POLL_TIMEOUT_MS }
      )
      .toBe('CAMERA_ONLY')

    // --- Troca pra "Lado a lado" - segunda operacao, SUBSTITUI a anterior (nao acumula).
    await layoutSelect.selectOption('SIDE_BY_SIDE')
    const afterSecondChange = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(afterSecondChange.layoutPreset).toBe('SIDE_BY_SIDE')

    // --- Desfazer (Ctrl+Z) reverte so a ULTIMA troca (lado a lado -> so camera, nao ate PIP). Um
    // `<select>` nao e um `<input>`/`<textarea>` - o guard de foco de texto do listener global nao
    // se aplica, sem necessidade de `.blur()` (ao contrario dos testes de fade/camera transform).
    await appWindow.keyboard.down('Control')
    await appWindow.keyboard.press('z')
    await appWindow.keyboard.up('Control')
    const afterUndo = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(afterUndo.layoutPreset).toBe('CAMERA_ONLY')
  })
})

/**
 * EDIT-012 (vigesimo terceiro incremento - Fase 3, autosave/dirty-state). Toda mutacao ja
 * persistia via IPC no instante em que acontece desde o EDIT-004/005/006 - este incremento so
 * torna essa garantia VISIVEL (indicador "Alteracoes salvas automaticamente"). Confirma que o
 * indicador comeca no estado "salvo" e volta pro estado "salvo" (nunca fica preso em "Salvando..."
 * nem mostra erro) depois de uma mutacao real bem-sucedida.
 */
test.describe('editor (autosave indicator)', () => {
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

  test('shows the auto-saved status by default and again after a real edit completes', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - autosave ${Date.now()}`

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
        message: 'aguardando o primeiro chunk de audio ser persistido em disco'
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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(1, { timeout: POLL_TIMEOUT_MS })

    // --- Estado inicial (nenhuma mutacao ainda) - ja "salvo", sem depender de nenhuma acao.
    const saveStatus = appWindow.locator('.editor-save-status')
    await expect(saveStatus).toHaveText('Alterações salvas automaticamente')
    await expect(saveStatus).not.toHaveClass(/editor-save-status--error/)

    // --- Realiza uma mutacao real (troca de layout - a mais simples de disparar via UI) e
    // confirma que o indicador volta pro estado "salvo" (nao erro, nao preso em "Salvando...").
    const layoutSelect = appWindow.getByLabel('Layout')
    await layoutSelect.selectOption('CAMERA_ONLY')
    await expect(saveStatus).toHaveText('Alterações salvas automaticamente', {
      timeout: POLL_TIMEOUT_MS
    })
    await expect(saveStatus).not.toHaveClass(/editor-save-status--error/)
  })
})

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4, Export). Grava tela+microfone (mesmo padrao
 * de `recording.spec.ts` "recording (screen + microphone)") - com so essas duas trilhas, o layout
 * padrao PIP resolve pra `single` com a tela de fundo (sem camera, nada pra sobrepor -
 * `computePreviewLayout`), dentro do escopo deste incremento (so trilha unica, sem PiP/lado-a-
 * lado). Exercita o pipeline REAL de ponta a ponta pela UI: clique no botao -> `export.start` real
 * -> FFmpeg real -> arquivo MP4 real em disco - a unica forma de confirmar que a nova superficie
 * de UI/IPC deste incremento funciona de verdade, nao so em isolamento (unit tests).
 */
test.describe('editor (export)', () => {
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

  test('exports a real 720p MP4 file via the UI and shows the completed status with its path', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - export ${Date.now()}`

    await openRecordingSetup(appWindow)
    const firstScreenSource = appWindow.locator('.screen-source-card').first()
    await expect(firstScreenSource).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await firstScreenSource.click()
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })
    await appWindow.getByLabel('Titulo da reuniao').fill(title)
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const projects = await appWindow.evaluate(() => window.meetingStudio.library.list())
    const rootPath = projects[0]!.rootPath
    const screenPath = join(rootPath, 'source', 'screen', 'screen_000001.webm')
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')
    await expect
      .poll(() => fileHasBytes(screenPath) && fileHasBytes(microphonePath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando os primeiros chunks de tela e audio serem persistidos em disco'
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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })

    await appWindow.getByRole('button', { name: 'Exportar em 720p' }).click()
    const exportStatus = appWindow.locator('.editor-export-status')
    await expect(exportStatus).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    // FFmpeg real precisa de tempo real pra codificar - timeout bem mais generoso que os demais
    // polls deste arquivo (que so esperam por I/O de disco, nao um encode de video de verdade).
    await expect(exportStatus).toContainText('Concluida', { timeout: 90_000 })
    await expect(exportStatus).toContainText(rootPath)

    const outputPath = await appWindow.evaluate(async () => {
      const jobs = await window.meetingStudio.export.list()
      return jobs[0]!.outputPath
    })
    expect(outputPath).toBeTruthy()
    expect(fileHasBytes(outputPath!)).toBe(true)
  })

  // EXP-008 (RF-035 "possibilidade de cancelar") - mesmo pipeline REAL de ponta a ponta do teste
  // acima, mas clicando "Cancelar exportação" LOGO apos iniciar em vez de esperar terminar.
  // Grava por mais tempo que o teste de sucesso (mais frames reais capturados) e exporta em
  // 1080p (mais pesado que 720p) especificamente pra dar uma janela real de FFmpeg ainda
  // trabalhando quando o clique de cancelar chega - sem essa folga, um clipe minusculo poderia
  // terminar de codificar antes do clique, tornando o teste nao-deterministico.
  test('cancels an in-progress export via the UI and shows the canceled status', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - cancelar exportacao ${Date.now()}`

    await openRecordingSetup(appWindow)
    const firstScreenSource = appWindow.locator('.screen-source-card').first()
    await expect(firstScreenSource).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await firstScreenSource.click()
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })
    await appWindow.getByLabel('Titulo da reuniao').fill(title)
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const projects = await appWindow.evaluate(() => window.meetingStudio.library.list())
    const rootPath = projects[0]!.rootPath
    const screenPath = join(rootPath, 'source', 'screen', 'screen_000001.webm')
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')
    await expect
      .poll(() => fileHasBytes(screenPath) && fileHasBytes(microphonePath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando os primeiros chunks de tela e audio serem persistidos em disco'
      })
      .toBe(true)
    // Espera um pouco mais que o teste de sucesso antes de parar - mais frames reais capturados,
    // clipe maior, encode real mais longo (a folga que este teste precisa pra cancelar de verdade
    // no meio do processo, nao so antes dele comecar).
    await appWindow.waitForTimeout(1500)

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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })

    await appWindow.getByRole('button', { name: 'Exportar em 1080p' }).click()
    const cancelButton = appWindow.getByRole('button', { name: 'Cancelar exportação' })
    await expect(cancelButton).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await cancelButton.click()

    const exportStatus = appWindow.locator('.editor-export-status')
    await expect(exportStatus).toContainText('Cancelada', { timeout: SELECT_TIMEOUT_MS })
    // O botao de cancelar some assim que o job entra num estado terminal - so QUEUED/RUNNING o
    // mostram (`isExportJobInProgress`, ver EditorProjectPage.tsx).
    await expect(cancelButton).toBeHidden({ timeout: SELECT_TIMEOUT_MS })

    const job = await appWindow.evaluate(async () => {
      const jobs = await window.meetingStudio.export.list()
      return jobs[0]!
    })
    expect(job.status).toBe('CANCELED')
    expect(job.outputPath).toBeNull()
  })

  // EXP-004b (PiP/lado-a-lado reais no arquivo exportado) - grava tela E camera juntas (nao so
  // tela+microfone como o teste de sucesso original) - com as duas trilhas de video presentes,
  // `computePreviewLayout`/`buildRenderPlan` resolvem pro layout PADRAO ('PIP') automaticamente,
  // sem precisar trocar o select de layout. Exercita o mesmo pipeline REAL de ponta a ponta (clique
  // -> `export.start` -> FFmpeg real com o filtro `overlay` novo -> MP4 real em disco) - a unica
  // forma de confirmar que a composicao PiP funciona de verdade pela UI, nao so em isolamento
  // (`export.service.test.ts` ja prova as dimensoes exatas via ffprobe real).
  test('exports a real PiP MP4 (screen background + camera overlay) via the UI', async () => {
    test.info().setTimeout(EDITOR_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - export PiP ${Date.now()}`

    await openRecordingSetup(appWindow)
    const firstScreenSource = appWindow.locator('.screen-source-card').first()
    await expect(firstScreenSource).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await firstScreenSource.click()
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
    const screenPath = join(rootPath, 'source', 'screen', 'screen_000001.webm')
    const cameraPath = join(rootPath, 'source', 'camera', 'camera_000001.webm')
    await expect
      .poll(() => fileHasBytes(screenPath) && fileHasBytes(cameraPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando os primeiros chunks de tela e camera serem persistidos em disco'
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
    await expect(appWindow.locator('.timeline__track')).toHaveCount(2, { timeout: POLL_TIMEOUT_MS })

    const editProjectId = await appWindow.evaluate(async () => {
      const list = await window.meetingStudio.editor.list()
      return list[0]!.id
    })
    const timeline = await appWindow.evaluate(
      (id) => window.meetingStudio.editor.getEditedTimeline(id),
      editProjectId
    )
    expect(timeline.layoutPreset).toBe('PIP') // confirma que este teste realmente exercita o caminho PiP.

    await appWindow.getByRole('button', { name: 'Exportar em 720p' }).click()
    const exportStatus = appWindow.locator('.editor-export-status')
    await expect(exportStatus).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await expect(exportStatus).toContainText('Concluida', { timeout: 90_000 })

    const outputPath = await appWindow.evaluate(async () => {
      const jobs = await window.meetingStudio.export.list()
      return jobs[0]!.outputPath
    })
    expect(outputPath).toBeTruthy()
    expect(fileHasBytes(outputPath!)).toBe(true)
  })
})
