import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

// Ver comentario detalhado em app-launch.spec.ts: o argumento e a raiz do projeto, nao o .js.
const APP_ROOT = process.cwd()
const MAIN_ENTRY = resolve(APP_ROOT, 'out/main/index.js')
const BUILD_MISSING_MESSAGE = 'Build ausente - rode "pnpm build" antes de "pnpm test:e2e".'
const POLL_TIMEOUT_MS = 40_000
const SELECT_TIMEOUT_MS = 25_000
// Timeout de teste elevado (padrao do Playwright e 60s, ver playwright.config.ts) so para os dois
// testes de gravacao real desta suite - ver "Decisao registrada" abaixo sobre contencao de
// recursos cumulativa entre lancamentos sequenciais do Electron na mesma suite.
const RECORDING_TEST_TIMEOUT_MS = 90_000
// So para o cenario de segmentacao: medido empiricamente que a camera sintetica do Chromium
// (`--use-fake-device-for-media-stream`) produz ~200 kbps - cruzar o limite minimo do schema
// (1 MB) leva ~42s em condicoes ideais (confirmado via arquivos reais chegando a 982 KB dentro do
// POLL_TIMEOUT_MS padrao de 40s, sem cruzar). Nao e flakiness nem bug de logica - o teste
// simplesmente precisava de mais tempo de parede para o segundo segmento aparecer.
const SEGMENTATION_POLL_TIMEOUT_MS = 90_000
const SEGMENTATION_TEST_TIMEOUT_MS = 120_000

function fileHasBytes(path: string): boolean {
  return existsSync(path) && statSync(path).size > 0
}

function fileByteSize(path: string): number {
  return existsSync(path) ? statSync(path).size : 0
}

/**
 * Testes de ponta a ponta da captura real (quinto incremento: tela + camera + microfone + audio
 * do sistema; sexto incremento: segmentacao por tempo/tamanho - ver `test.describe('recording
 * (segmentation)')` ao final do arquivo). Usa os dispositivos sinteticos de audio/video do Chromium
 * (`--use-fake-device-for-media-stream`, habilitado via `MEETING_STUDIO_E2E_FAKE_MEDIA=1` - ver
 * `main/index.ts`) para microfone/camera, e captura real via `chromeMediaSource: 'desktop'` para
 * tela e audio do sistema (nao afetada pela flag de dispositivo falso, que so cobre
 * getUserMedia de camera/microfone).
 *
 * Decisao registrada: dividido em cenarios de 2 trilhas (nao um unico de 4) - capturar tela +
 * camera + microfone SIMULTANEAMENTE via hardware/streams reais mostrou-se pesado demais para
 * este ambiente de teste (codificacao de video de tela e cara), causando falta de recursos para
 * uma das trilhas de forma intermitente, apesar da logica em si (`RecordingSessionManager`) ja
 * estar provada correta com ate 4 trilhas simultaneas via dados sinteticos em
 * `tests/unit/main/recording-session-manager.test.ts` (sem essa restricao de hardware). Os testes
 * abaixo cobrem cada par de combinacao real sem empilhar todas de uma vez.
 *
 * A variavel da janela do app e chamada `appWindow` (nao `window`) deliberadamente: o tipo global
 * `window.meetingStudio` (declarado em `src/renderer/global.d.ts`) precisa ser referenciado dentro
 * do callback de `evaluate()`, que roda no contexto do browser - nomear a variavel local `window`
 * sombrearia o `window` do DOM dentro desse callback e quebraria a checagem de tipos.
 *
 * Espera pela condicao REAL (arquivo de segmento com bytes no disco) via `expect.poll` em vez de
 * um `waitForTimeout` fixo - mais robusto sob carga de sistema variavel (fonte real de flakiness
 * observada durante o desenvolvimento).
 *
 * Decisao registrada: `POLL_TIMEOUT_MS`/`RECORDING_TEST_TIMEOUT_MS` sao mais generosos que o
 * necessario para uma execucao isolada (a trilha de camera tipicamente aparece em poucos segundos
 * quando testada sozinha - confirmado repetidas vezes durante o desenvolvimento). Rodando a suite
 * INTEIRA (12 testes, 1 worker, cada describe abrindo/fechando sua propria instancia do Electron),
 * observou-se flakiness intermitente especificamente na trilha de video da camera apos varios
 * lancamentos sequenciais anteriores na mesma execucao - contencao cumulativa de recursos
 * (GPU/CPU) neste ambiente de teste, nao um bug de aplicacao: a logica multi-trilha ja esta
 * provada correta via `tests/unit/main/recording-session-manager.test.ts` (dados sinteticos, sem
 * essa restricao de hardware) e este mesmo teste passa de forma rapida e consistente quando
 * executado isolado (`playwright test recording.spec.ts -g "microphone and camera"`). Aumentar o
 * timeout aqui e a opcao tecnicamente mais solida entre as duas consideradas: (a) reduzir a suite
 * para menos lancamentos de Electron por execucao, o que perderia cobertura, ou (b) dar a trilha
 * mais lenta (video) tempo suficiente para aparecer sob contencao real - (b) preserva cobertura
 * sem mascarar uma falha genuina (o poll ainda falha se o chunk nunca chegar).
 */

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

// Parametro chamado `page` (nao `window`) deliberadamente: `getActiveProjectPaths` chama
// `.evaluate()`, cujo callback referencia o `window` global do DOM - nomear o parametro `window`
// sombrearia esse global dentro do callback e quebraria a checagem de tipos (mesmo problema
// documentado no topo do arquivo para a variavel `appWindow`).
async function openRecordingSetup(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegacao principal' })
    .getByRole('link', { name: 'Nova gravacao' })
    .click()
}

async function getActiveProjectPaths(page: Page): Promise<{ rootPath: string; status: string }> {
  const projects = await page.evaluate(() => window.meetingStudio.library.list())
  const active = projects[0]
  expect(active).toBeTruthy()
  return active!
}

test.describe('recording (microphone + camera)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)

  // Decisao registrada: 2 retries so aqui (nao no describe de tela+microfone, que nunca mostrou
  // esse sintoma) - sob a suite completa (12 testes, 1 worker, varios lancamentos sequenciais do
  // Electron no mesmo processo), a trilha de VIDEO da camera especificamente mostrou flakiness
  // intermitente (~50% das execucoes completas da suite, mesmo com POLL_TIMEOUT_MS generoso) que
  // NAO se reproduz isolada (`playwright test recording.spec.ts -g "microphone and camera"` passa
  // rapido e consistentemente) nem nos testes sinteticos de `recording-session-manager.test.ts` -
  // ou seja, e contencao de recursos (GPU/CPU) especifica deste ambiente/topologia de teste (N
  // instancias reais do Electron em sequencia no mesmo processo Node), nao um bug de aplicacao.
  // `beforeEach`/`afterEach` (nao `beforeAll`/`afterAll`) garantem que cada retry relança uma
  // instancia FRESCA do Electron, isolada de qualquer degradacao da tentativa anterior.
  test.describe.configure({ retries: 2 })

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeEach(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterEach(async () => {
    await electronApp.close()
  })

  test('records microphone and camera end-to-end and persists two non-empty segment files', async () => {
    test.info().setTimeout(RECORDING_TEST_TIMEOUT_MS)
    await openRecordingSetup(appWindow)

    // `getByLabel` faz correspondencia por substring por padrao - "Nivel do microfone" (aria-label
    // do medidor de nivel) tambem contem "microfone", entao exact:true e necessario aqui.
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })

    const cameraSelect = appWindow.getByLabel('Camera', { exact: true })
    await expect(cameraSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await cameraSelect.selectOption({ index: 1 })

    // A selecao de camera dispara `getUserMedia` assincronamente (useDeviceStream); o botao
    // "Iniciar gravacao" fica habilitado assim que `selectedCameraId` muda (estado sincrono), antes
    // da MediaStream em si estar pronta. Sem esperar o preview aparecer, a gravacao pode comecar
    // com `sources.camera` ainda `null` em `useRecordingSession`, fazendo a trilha de camera nunca
    // ser criada (bug de timing do teste, identificado ao investigar falha consistente aqui).
    await expect(appWindow.locator('video.camera-preview')).toBeVisible({ timeout: SELECT_TIMEOUT_MS })

    await appWindow.getByLabel('Titulo da reuniao').fill('Reuniao de teste E2E - mic+camera')
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const { rootPath } = await getActiveProjectPaths(appWindow)
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')
    const cameraPath = join(rootPath, 'source', 'camera', 'camera_000001.webm')

    await expect
      .poll(() => fileHasBytes(microphonePath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de audio ser persistido em disco'
      })
      .toBe(true)
    await expect
      .poll(() => fileHasBytes(cameraPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de video (camera) ser persistido em disco'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    const finalized = await getActiveProjectPaths(appWindow)
    expect(finalized.status).toBe('COMPLETED')
    expect(fileHasBytes(microphonePath)).toBe(true)
    expect(fileHasBytes(cameraPath)).toBe(true)
  })
})

test.describe('recording (screen + microphone)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeAll(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('records screen and microphone end-to-end and persists two non-empty segment files', async () => {
    test.info().setTimeout(RECORDING_TEST_TIMEOUT_MS)
    await openRecordingSetup(appWindow)

    const firstScreenSource = appWindow.locator('.screen-source-card').first()
    await expect(firstScreenSource).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await firstScreenSource.click()

    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })

    await appWindow.getByLabel('Titulo da reuniao').fill('Reuniao de teste E2E - screen+mic')
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const { rootPath } = await getActiveProjectPaths(appWindow)
    const screenPath = join(rootPath, 'source', 'screen', 'screen_000001.webm')
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')

    await expect
      .poll(() => fileHasBytes(screenPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de tela ser persistido em disco'
      })
      .toBe(true)
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

    const finalized = await getActiveProjectPaths(appWindow)
    expect(finalized.status).toBe('COMPLETED')
    expect(fileHasBytes(screenPath)).toBe(true)
    expect(fileHasBytes(microphonePath)).toBe(true)
  })
})

test.describe('recording (system audio + microphone)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeAll(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('records system audio and microphone end-to-end and persists two non-empty segment files', async () => {
    test.info().setTimeout(RECORDING_TEST_TIMEOUT_MS)
    await openRecordingSetup(appWindow)

    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })

    // RF-005: so um checkbox (nao ha dispositivo/id para escolher - e o audio de saida inteiro
    // do sistema), diferente de camera/tela que sao pickers.
    const systemAudioCheckbox = appWindow.getByRole('checkbox', { name: /Audio do sistema/i })
    await expect(systemAudioCheckbox).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await systemAudioCheckbox.check()

    await appWindow.getByLabel('Titulo da reuniao').fill('Reuniao de teste E2E - system audio+mic')
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const { rootPath } = await getActiveProjectPaths(appWindow)
    const systemAudioPath = join(rootPath, 'source', 'system-audio', 'system-audio_000001.webm')
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')

    await expect
      .poll(() => fileHasBytes(microphonePath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de audio (microfone) ser persistido em disco'
      })
      .toBe(true)
    await expect
      .poll(() => fileHasBytes(systemAudioPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de audio do sistema ser persistido em disco'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    const finalized = await getActiveProjectPaths(appWindow)
    expect(finalized.status).toBe('COMPLETED')
    expect(fileHasBytes(systemAudioPath)).toBe(true)
    expect(fileHasBytes(microphonePath)).toBe(true)
  })
})

/**
 * RF-012/RF-013 (sexto incremento - segmentacao por tempo/tamanho). Cobre so o caminho por
 * TAMANHO: `timeSegmentationMinutes` e um inteiro em MINUTOS (minimo 1, ver
 * `settings.schema.ts`) - nao ha como forcar uma rotacao por tempo em poucos segundos sem mudar o
 * schema so para acomodar velocidade de teste (decisao registrada: nao fazer isso so por
 * conveniencia de teste). A logica de rotacao por TEMPO fica coberta pelos testes unitarios
 * sinteticos de `recording-session-manager.test.ts`, que nao dependem de tempo real. Grava so
 * CAMERA.
 *
 * Bug real encontrado e corrigido durante o desenvolvimento deste teste (nao um problema do
 * teste em si): `MediaRecorder.stop()` emite um ultimo chunk de flush ANTES do evento `'stop'` -
 * esse chunk final ainda pertencia ao segmento antigo, mas seu `totalBytes` continuava acima do
 * limite configurado (bytes so crescem), entao disparava uma SEGUNDA rotacao redundante logo
 * apos a primeira - que apagava o segmento recem-criado quase instantaneamente e pulava direto
 * para o proximo indice (`..._000002.webm` nunca chegava a existir, a rotacao ia direto para
 * `..._000003.webm`). Diagnosticado via log temporario capturando `page.on('console')` durante
 * uma execucao isolada. Corrigido em `useRecordingSession.ts` com uma guarda
 * (`rotationInFlightRef`) que impede enfileirar uma nova rotacao enquanto uma ja esta em
 * andamento para a trilha.
 *
 * Decisao registrada: 2 retries + `beforeEach`/`afterEach` (mesmo padrao do describe "microphone
 * + camera") mantidos MESMO apos corrigir o bug acima - a taxa real de bytes/segundo da camera
 * sintetica (`--use-fake-device-for-media-stream`) mostrou-se muito mais variavel do que o
 * esperado sob a carga deste ambiente de teste (medido empiricamente: de ~27 KB a ~982 KB+ em
 * janelas de gravacao de duracao semelhante) - mesma classe de contencao de recursos ja
 * documentada para a trilha de video da camera no describe "microphone + camera". Cada retry
 * relanca uma instancia FRESCA do Electron, isolada de qualquer degradacao da tentativa anterior.
 */
test.describe('recording (segmentation)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)
  test.describe.configure({ retries: 2 })

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeEach(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterEach(async () => {
    // Restaurado a cada tentativa (nao so no fim de todas) - este ambiente compartilha o mesmo
    // `userData` (e portanto o mesmo `meeting-studio.db`) entre execucoes de teste, entao um
    // limite de 1 MB deixado para tras afetaria gravacoes de teste (ou manuais) subsequentes,
    // mesmo que esta tentativa especifica tenha falhado e seja repetida.
    await appWindow
      .evaluate(async () => {
        await window.meetingStudio.settings.update('recordingPresets', {
          qualityPreset: 'STANDARD',
          timeSegmentationMinutes: 15,
          sizeSegmentationMb: null,
          diskSpaceWarningThresholdMb: 2048,
          diskSpaceCriticalThresholdMb: 512
        })
      })
      .catch(() => {})
    await electronApp.close()
  })

  test('rotates the camera track into a second segment file once the configured size limit is crossed', async () => {
    test.info().setTimeout(SEGMENTATION_TEST_TIMEOUT_MS)
    await openRecordingSetup(appWindow)

    // Limite minimo permitido pelo schema (1 MB) - gera o segundo segmento em poucos segundos de
    // video sintetico. `timeSegmentationMinutes: null` evita qualquer interferencia do timer de
    // tempo (o default de producao e 15 minutos - nunca dispararia dentro da duracao deste teste
    // de qualquer forma, mas deixar explicito evita depender do valor padrao).
    await appWindow.evaluate(async () => {
      const current = await window.meetingStudio.settings.get('recordingPresets')
      await window.meetingStudio.settings.update('recordingPresets', {
        ...current,
        timeSegmentationMinutes: null,
        sizeSegmentationMb: 1
      })
    })

    const cameraSelect = appWindow.getByLabel('Camera', { exact: true })
    await expect(cameraSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await cameraSelect.selectOption({ index: 1 })
    // Mesmo cuidado do describe "microphone + camera": esperar o preview aparecer antes de
    // iniciar, garantindo que a MediaStream ja esta pronta quando `recording.start` for chamado.
    await expect(appWindow.locator('video.camera-preview')).toBeVisible({ timeout: SELECT_TIMEOUT_MS })

    await appWindow.getByLabel('Titulo da reuniao').fill('Reuniao de teste E2E - segmentacao')
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const { rootPath } = await getActiveProjectPaths(appWindow)
    const firstSegmentPath = join(rootPath, 'source', 'camera', 'camera_000001.webm')
    const secondSegmentPath = join(rootPath, 'source', 'camera', 'camera_000002.webm')

    await expect
      .poll(() => fileHasBytes(firstSegmentPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro segmento de camera ser persistido em disco'
      })
      .toBe(true)
    await expect
      .poll(() => fileHasBytes(secondSegmentPath), {
        timeout: SEGMENTATION_POLL_TIMEOUT_MS,
        message: 'aguardando rotacao para o segundo segmento de camera (limite de 1 MB)'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    const finalized = await getActiveProjectPaths(appWindow)
    expect(finalized.status).toBe('COMPLETED')
    expect(fileHasBytes(firstSegmentPath)).toBe(true)
    expect(fileHasBytes(secondSegmentPath)).toBe(true)

    const manifestPath = join(rootPath, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
      tracks: Array<{ type: string; segments: Array<{ index: number; finalized: boolean }> }>
    }
    const cameraTrack = manifest.tracks.find((track) => track.type === 'camera')
    expect(cameraTrack?.segments.length).toBeGreaterThanOrEqual(2)
    expect(cameraTrack?.segments.every((segment) => segment.finalized)).toBe(true)
  })
})

/**
 * RF-010 (setimo incremento - pausar/retomar). So microfone (fonte mais leve/confiavel deste
 * ambiente de teste, ver decisoes registradas nos describes acima sobre variabilidade de
 * camera/tela sob carga) - pausar/retomar em si nao depende de qual fonte, so testa a maquina de
 * estados + o comportamento real do `MediaRecorder.pause()`/`.resume()`.
 */
test.describe('recording (pause/resume)', () => {
  test.skip(!existsSync(MAIN_ENTRY), BUILD_MISSING_MESSAGE)

  let electronApp: ElectronApplication
  let appWindow: Page

  test.beforeAll(async () => {
    ;({ app: electronApp, window: appWindow } = await launchApp())
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('pauses recording (no byte growth), resumes (growth continues), and finishes as a single continuous segment', async () => {
    test.info().setTimeout(RECORDING_TEST_TIMEOUT_MS)
    await openRecordingSetup(appWindow)

    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })

    await appWindow.getByLabel('Titulo da reuniao').fill('Reuniao de teste E2E - pausar/retomar')
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const { rootPath } = await getActiveProjectPaths(appWindow)
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')
    const secondSegmentPath = join(rootPath, 'source', 'microphone', 'microphone_000002.webm')

    await expect
      .poll(() => fileHasBytes(microphonePath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de audio ser persistido em disco'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Pausar' }).click()
    await expect(appWindow.getByRole('status')).toContainText('PAUSADO', { timeout: 10_000 })
    const sizeAtPause = fileByteSize(microphonePath)

    // Verificar a AUSENCIA de crescimento nao tem uma condicao real pra fazer poll (o oposto de
    // "aguardar ate acontecer") - uma espera fixa e a unica forma correta de checar isso, ao
    // contrario do resto do arquivo, que sempre espera uma condicao real via `expect.poll`.
    await appWindow.waitForTimeout(3_000)
    expect(fileByteSize(microphonePath)).toBe(sizeAtPause)

    await appWindow.getByRole('button', { name: 'Retomar' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    await expect
      .poll(() => fileByteSize(microphonePath) > sizeAtPause, {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando o arquivo crescer de novo apos retomar'
      })
      .toBe(true)

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    // Pausar/retomar nunca fecha/abre arquivo (diferente da segmentacao) - so DEVE existir um
    // unico segmento continuo pra essa trilha, do inicio ao fim da gravacao.
    expect(fileHasBytes(secondSegmentPath)).toBe(false)

    const finalized = await getActiveProjectPaths(appWindow)
    expect(finalized.status).toBe('COMPLETED')

    const manifestPath = join(rootPath, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
      status: string
      pauseIntervals: Array<{ pausedAtMs: number; resumedAtMs: number | null }>
      tracks: Array<{ type: string; segments: Array<{ index: number }> }>
    }
    expect(manifest.pauseIntervals).toHaveLength(1)
    expect(manifest.pauseIntervals[0]?.resumedAtMs).not.toBeNull()
    const microphoneTrack = manifest.tracks.find((track) => track.type === 'microphone')
    expect(microphoneTrack?.segments).toHaveLength(1)
  })
})
