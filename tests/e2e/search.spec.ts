import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// Ver comentario detalhado em app-launch.spec.ts: o argumento e a raiz do projeto, nao o .js.
const APP_ROOT = process.cwd()
const MAIN_ENTRY = resolve(APP_ROOT, 'out/main/index.js')
const BUILD_MISSING_MESSAGE = 'Build ausente - rode "pnpm build" antes de "pnpm test:e2e".'

async function openSearch(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegacao principal' })
    .getByRole('link', { name: 'Busca' })
    .click()
}

/**
 * SEARCH-001 (trigesimo terceiro incremento - Fase 7 "Knowledge"). So o caminho ponta-a-ponta
 * REAL e verificavel nesta fase: buscar via UI, chamando de fato `search.transcripts` por IPC ate
 * o FTS5 real (nenhum mock). Como AI-002 (transcricao real) ainda nao existe, nenhum caminho de UI
 * consegue popular `transcript_segments` com dados reais - entao "nenhum resultado encontrado" e
 * o unico desfecho possivel hoje, e e exatamente isso que este teste confirma (mesmo espirito do
 * teste E2E de AI-001, que confirma a falha esperada "nenhum provedor" em vez de simular uma
 * transcricao completa). `buildFtsMatchQuery`/`SearchService`/`SearchRepository` ja tem cobertura
 * direta com dados reais em `tests/unit/main/search.service.test.ts` (via
 * `TranscriptRepository.createWithSegments`, o unico jeito de popular a tabela hoje).
 */
test.describe('search', () => {
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

  test('searches via the UI and shows the expected "no results" state (no real transcript exists yet)', async () => {
    await openSearch(window)
    await expect(window.getByRole('heading', { name: 'Busca' })).toBeVisible()

    await window.getByPlaceholder('Buscar em transcricoes...').fill('reuniao')
    await window.getByRole('button', { name: 'Buscar' }).click()

    await expect(window.getByText('Nenhum resultado.', { exact: false })).toBeVisible()
  })

  test('does not search when the query is only whitespace', async () => {
    await openSearch(window)
    await window.getByPlaceholder('Buscar em transcricoes...').fill('   ')
    // O botao fica desabilitado - `query.trim()` vazio - nenhuma chamada IPC deveria disparar.
    await expect(window.getByRole('button', { name: 'Buscar' })).toBeDisabled()
  })
})
