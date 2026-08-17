import { HashRouter } from 'react-router-dom'
import { AppProviders } from './providers'
import { AppShell } from '../layouts/AppShell'
import { AppRoutes } from './routes'
import { RecordingSessionProvider } from '../features/recording/RecordingSessionProvider'

/**
 * `HashRouter` (nao `BrowserRouter`): o renderer e carregado via `file://` em producao
 * (`window.loadFile`, ver `main/window.ts`) - roteamento baseado em hash nao depende de um
 * servidor capaz de resolver sub-rotas para `index.html`.
 */
export function App() {
  return (
    <AppProviders>
      <HashRouter>
        {/* Fora de `<AppRoutes/>` deliberadamente - `RecordingSessionProvider` precisa sobreviver
            a troca de rota (ver comentario completo no proprio arquivo). `AppShell` tambem nunca
            desmonta com a navegacao, entao um `RecordingStatusBar` la dentro sempre consegue ler
            este contexto. */}
        <RecordingSessionProvider>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </RecordingSessionProvider>
      </HashRouter>
    </AppProviders>
  )
}
