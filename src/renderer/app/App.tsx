import { HashRouter } from 'react-router-dom'
import { AppProviders } from './providers'
import { AppShell } from '../layouts/AppShell'
import { AppRoutes } from './routes'

/**
 * `HashRouter` (nao `BrowserRouter`): o renderer e carregado via `file://` em producao
 * (`window.loadFile`, ver `main/window.ts`) - roteamento baseado em hash nao depende de um
 * servidor capaz de resolver sub-rotas para `index.html`.
 */
export function App() {
  return (
    <AppProviders>
      <HashRouter>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </HashRouter>
    </AppProviders>
  )
}
