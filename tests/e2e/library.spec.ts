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
const LIBRARY_TEST_TIMEOUT_MS = 90_000

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

async function getActiveProjectPaths(
  page: Page
): Promise<{ id: string; rootPath: string; status: string }> {
  const projects = await page.evaluate(() => window.meetingStudio.library.list())
  const active = projects[0]
  expect(active).toBeTruthy()
  return active!
}

/**
 * LIB-002/LIB-004/LIB-006 (decimo primeiro incremento - Fase 2, Biblioteca). Arquivo proprio
 * (nao mais uma secao dentro de `recording.spec.ts`) - decisao registrada: a partir daqui os
 * cenarios de ponta a ponta deixam de ser todos "sobre gravacao" (este e sobre a tela da
 * Biblioteca em si), entao um arquivo por area de produto fica mais facil de navegar conforme a
 * suite cresce ao longo do roadmap.
 *
 * Grava uma sessao real curta (so microfone, ja provado suficiente pelos outros describes desta
 * suite para exercitar o pipeline de disco de ponta a ponta) para ter um projeto real com
 * trilha/segmento reais antes de exercitar detalhes/renomear/excluir.
 */
test.describe('library (details, rename, delete)', () => {
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

  test('shows details, renames, and permanently deletes a recorded project', async () => {
    test.info().setTimeout(LIBRARY_TEST_TIMEOUT_MS)
    const originalTitle = `Reuniao de teste E2E - biblioteca ${Date.now()}`
    const renamedTitle = `${originalTitle} (renomeada)`

    await openRecordingSetup(appWindow)
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })
    await appWindow.getByLabel('Titulo da reuniao').fill(originalTitle)
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const { rootPath } = await getActiveProjectPaths(appWindow)
    const microphonePath = join(rootPath, 'source', 'microphone', 'microphone_000001.webm')
    await expect
      .poll(() => fileHasBytes(microphonePath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando primeiro chunk de audio ser persistido em disco'
      })
      .toBe(true)

    // RF-016 - marcador com titulo/nota, criado aqui pra confirmar mais adiante que a Biblioteca
    // (LIB-002 + RF-016) mostra o marcador de verdade nos detalhes expandidos, nao so
    // `markers.list` via `evaluate` (ja coberto em `recording.spec.ts`).
    await appWindow.getByLabel('Titulo do marcador').fill('Ponto chave')
    await appWindow.getByLabel('Nota do marcador').fill('Revisar depois')
    await appWindow.getByRole('button', { name: 'Marcador' }).click()
    await expect(appWindow.getByRole('status')).toContainText('1 marcador', { timeout: 10_000 })

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    await openLibrary(appWindow)
    const listItem = appWindow.locator('.library-list__item').filter({ hasText: originalTitle })
    await expect(listItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })

    // --- Detalhes (LIB-002): confirma a trilha de microfone com >0 bytes, sem escanear o disco
    // de novo pelo teste - so verifica que a UI reflete o que o banco ja sabe.
    await listItem.getByRole('button', { name: 'Detalhes' }).click()
    await expect(listItem.getByText('Microfone:', { exact: false })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
    await expect(listItem.getByText('1 segmento', { exact: false })).toBeVisible()
    // RF-016 - marcador com titulo/nota (criado durante a gravacao acima) aparece nos mesmos
    // detalhes expandidos - `markers.list` ja existia desde a Fase 1, esta e a primeira vez que
    // uma tela de verdade consome o resultado (antes so era exercitado por teste via `evaluate`).
    await expect(listItem.getByText('Ponto chave', { exact: false })).toBeVisible()
    await expect(listItem.getByText('Revisar depois', { exact: false })).toBeVisible()

    // --- Renomear (LIB-004). Uma vez em modo de edicao, o titulo original deixa de aparecer como
    // TEXTO no DOM (vira o `value` de um `<input>`, que `hasText` nao enxerga) - entao os
    // proximos locators usam `getByLabel`/`getByRole` sem escopo em `listItem` (so um item pode
    // estar em edicao por vez, o que torna isso seguro), em vez de re-filtrar por `originalTitle`.
    await listItem.getByRole('button', { name: 'Renomear' }).click()
    const renameInput = appWindow.getByLabel('Novo titulo da reuniao')
    await renameInput.fill(renamedTitle)
    await appWindow.getByRole('button', { name: 'Salvar' }).click()
    const renamedItem = appWindow.locator('.library-list__item').filter({ hasText: renamedTitle })
    await expect(renamedItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })

    // --- Excluir (LIB-006): exige confirmacao explicita antes de remover de verdade.
    await renamedItem.getByRole('button', { name: 'Excluir', exact: true }).click()
    await renamedItem.getByRole('button', { name: 'Sim, excluir' }).click()
    await expect(renamedItem).not.toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await expect
      .poll(() => existsSync(rootPath), {
        timeout: POLL_TIMEOUT_MS,
        message: 'aguardando a pasta do projeto ser removida do disco'
      })
      .toBe(false)
  })
})
