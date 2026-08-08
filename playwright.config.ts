import { defineConfig } from '@playwright/test'

// Playwright dirige o binario do Electron diretamente via `_electron.launch()`
// (ver tests/e2e/*.spec.ts) - por isso nao ha `webServer`/`use.baseURL` aqui,
// diferente de um projeto web comum.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results'
})
