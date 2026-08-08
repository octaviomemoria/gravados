import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = {
  '@shared': resolve('src/shared')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        ...sharedAlias,
        '@main': resolve('src/main')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts')
        }
      }
    }
  },
  preload: {
    // Com `sandbox: true` (secure-webpreferences.ts), o preload roda em um contexto de require()
    // restrito que so resolve modulos nativos do Electron/Node - pacotes npm normais (ex.: zod)
    // precisam estar IN-BUNDLE, nao externalizados, ou o preload falha silenciosamente em runtime
    // ("module not found"). electron-vite 5 externaliza dependencias por padrao mesmo sem o
    // plugin `externalizeDepsPlugin()` (via `build.externalizeDeps ?? true` internamente) -
    // `externalizeDeps: false` desativa esse comportamento padrao. So `electron` fica externo (e
    // um modulo virtual fornecido pelo runtime, nunca deve ser empacotado).
    resolve: {
      alias: {
        ...sharedAlias,
        '@preload': resolve('src/preload')
      }
    },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron'],
        input: {
          index: resolve('src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    }
  }
})
