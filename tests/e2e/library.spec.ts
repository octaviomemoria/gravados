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
// Refinamento pós-LIB-PLAYER (edição/exclusão de marcadores) - o primeiro teste deste arquivo
// ganhou passos reais adicionais (editar marcador, salvar, excluir marcador com confirmação),
// alongando o tempo total; 90s ficou apertado demais mesmo sob carga normal de máquina.
const LIBRARY_TEST_TIMEOUT_MS = 150_000

function fileHasBytes(path: string): boolean {
  return existsSync(path) && statSync(path).size > 0
}

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [APP_ROOT],
    env: {
      ...process.env,
      MEETING_STUDIO_E2E_FAKE_MEDIA: '1',
      MEETING_STUDIO_E2E_FAKE_TRANSCRIPTION: '1',
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

    // --- Editar marcador (refinamento pós-LIB-PLAYER, resolve a pendência "marcadores não têm
    // edição/exclusão depois de criados"). Edita título/nota inline, confirma que o texto antigo
    // sumiu e o novo aparece.
    await listItem.getByRole('button', { name: 'Editar marcador' }).click()
    const markerTitleInput = listItem.getByLabel('Titulo do marcador')
    const markerNoteInput = listItem.getByLabel('Nota do marcador')
    await markerTitleInput.fill('Ponto revisado')
    await markerNoteInput.fill('Ja revisado')
    await listItem.getByRole('button', { name: 'Salvar' }).click()
    await expect(listItem.getByText('Ponto revisado', { exact: false })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
    await expect(listItem.getByText('Ja revisado', { exact: false })).toBeVisible()
    await expect(listItem.getByText('Ponto chave', { exact: false })).not.toBeVisible()

    // --- Excluir marcador: exige confirmacao explicita, mesmo padrao de excluir um projeto.
    await listItem.getByRole('button', { name: 'Excluir marcador' }).click()
    await listItem.getByRole('button', { name: 'Sim, excluir marcador' }).click()
    await expect(listItem.getByText('Ponto revisado', { exact: false })).not.toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
    await expect(listItem.getByText('Nenhum marcador nesta gravacao', { exact: false })).toBeVisible()

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

  /**
   * AI-001 entregou o pipeline (IPC/job/UI); refinamento pos-SEARCH-001 conectou `WHISPER_LOCAL`
   * de verdade (Whisper local via `@huggingface/transformers`). Rodar um modelo Whisper REAL
   * baixaria ~150MB+ da internet na primeira execucao - uma dependencia de rede/tempo que este
   * projeto mantem deliberadamente fora da suite automatizada (decisao registrada no README).
   * `MEETING_STUDIO_E2E_FAKE_TRANSCRIPTION=1` (setado em `launchApp`) substitui o provedor real por
   * um resultado instantaneo - o resto do pipeline (extracao de audio REAL via ffmpeg contra o
   * arquivo gravado de verdade, IPC, persistencia, UI) roda sem nenhum mock. O provedor real em si
   * (chamada real ao `@huggingface/transformers`) ja tem cobertura completa e determinística em
   * `transcription.service.test.ts`/`whisper-local-provider.test.ts` (pipeline injetado, sem rede).
   */
  test('starts a transcription via the UI and completes with the fake E2E provider (real audio extraction)', async () => {
    test.info().setTimeout(LIBRARY_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - transcricao ${Date.now()}`

    await openRecordingSetup(appWindow)
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })
    await appWindow.getByLabel('Titulo da reuniao').fill(title)
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

    await appWindow.getByRole('button', { name: 'Parar' }).click()
    await expect(appWindow.getByRole('button', { name: 'Iniciar gravacao' })).toBeVisible({
      timeout: SELECT_TIMEOUT_MS
    })

    await openLibrary(appWindow)
    const listItem = appWindow.locator('.library-list__item').filter({ hasText: title })
    await expect(listItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await listItem.getByRole('button', { name: 'Detalhes' }).click()
    await expect(listItem.getByText('Microfone:', { exact: false })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })

    await listItem.getByRole('button', { name: 'Transcrever' }).click()
    const status = listItem.locator('.library-list__transcription-status')
    await expect(status).toContainText('Concluida', { timeout: POLL_TIMEOUT_MS })

    // Refinamento pos-MVP (pedido real do usuario - "onde encontro a transcricao?" + caixa de
    // texto editavel com copiar/editar). `buildFakeTranscriptionProviderForE2E` (main/index.ts)
    // sempre devolve o segmento fixo "teste e2e".
    await listItem.getByRole('button', { name: 'Ver transcrição' }).click()
    // Escopo no painel da transcricao: o cartao da Biblioteca ja tem um "Editar" proprio (edita o
    // projeto), e um seletor so por nome casaria com os dois (strict mode violation no CI).
    const transcriptPanel = listItem.locator('.library-list__transcript-panel')
    const textarea = transcriptPanel.getByLabel('Texto da transcrição')
    await expect(textarea).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await expect(textarea).toHaveValue('teste e2e')
    await expect(textarea).toHaveAttribute('readonly', '')

    await transcriptPanel.getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(textarea).not.toHaveAttribute('readonly', '')
    await textarea.fill('texto corrigido manualmente')
    await transcriptPanel.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(transcriptPanel.getByRole('button', { name: 'Editar', exact: true })).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    await expect(textarea).toHaveValue('texto corrigido manualmente')
    await expect(textarea).toHaveAttribute('readonly', '')

    // Fecha e reabre - confirma que a edicao foi persistida de verdade (transcripts.editedText),
    // nao so mantida em estado local do componente.
    await listItem.getByRole('button', { name: 'Fechar transcrição' }).click()
    await expect(textarea).not.toBeVisible()
    await listItem.getByRole('button', { name: 'Ver transcrição' }).click()
    await expect(textarea).toHaveValue('texto corrigido manualmente', { timeout: POLL_TIMEOUT_MS })
  })

  /**
   * Refinamento pos-AI-002-LOCAL - deep-link de um resultado de busca (`SearchPage.tsx`,
   * `?projectId=&startMs=`) direto pra Biblioteca: expande automaticamente o projeto certo e
   * mostra o player minimo (`pickPreviewSource`, primeiro segmento da trilha principal). Navega
   * via `window.location.hash` (HashRouter, `App.tsx`) simulando exatamente o link que
   * `SearchPage.tsx` gera, sem precisar de uma transcricao/busca real - o alvo deste teste e a
   * Biblioteca reagir ao deep-link, ja coberto separadamente por `search.spec.ts`.
   */
  test('auto-expands and renders a player when navigated to via a search deep-link', async () => {
    test.info().setTimeout(LIBRARY_TEST_TIMEOUT_MS)
    const title = `Reuniao de teste E2E - deep-link ${Date.now()}`

    await openRecordingSetup(appWindow)
    const micSelect = appWindow.getByLabel('Microfone', { exact: true })
    await expect(micSelect).toBeVisible({ timeout: SELECT_TIMEOUT_MS })
    await micSelect.selectOption({ index: 1 })
    await appWindow.getByLabel('Titulo da reuniao').fill(title)
    await appWindow.getByRole('button', { name: 'Iniciar gravacao' }).click()
    await expect(appWindow.getByRole('status')).toContainText('REC', { timeout: 10_000 })

    const { id: projectId, rootPath } = await getActiveProjectPaths(appWindow)
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

    await appWindow.evaluate((id) => {
      window.location.hash = `#/library?projectId=${id}&startMs=500`
    }, projectId)

    const listItem = appWindow.locator('.library-list__item').filter({ hasText: title })
    await expect(listItem).toBeVisible({ timeout: POLL_TIMEOUT_MS })
    // Expandiu SOZINHO, sem clicar "Detalhes" - o proprio deep-link disparou.
    await expect(listItem.getByText('Microfone:', { exact: false })).toBeVisible({
      timeout: POLL_TIMEOUT_MS
    })
    await expect(listItem.locator('.library-list__player')).toBeVisible()
  })
})
