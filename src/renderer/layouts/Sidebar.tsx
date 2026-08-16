import { NavLink } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE } from '@shared/constants/app-info'

/** 08_UX_FLOWS.md secao 1: Home, Nova gravacao, Biblioteca, Projetos de edicao, Exportacoes,
 * Busca (SEARCH-001, Fase 7), Configuracoes. */
const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Home', end: true },
  { to: '/recording', label: 'Nova gravacao' },
  { to: '/library', label: 'Biblioteca' },
  { to: '/editor', label: 'Projetos' },
  { to: '/exports', label: 'Exportacoes' },
  { to: '/search', label: 'Busca' },
  { to: '/settings', label: 'Configuracoes' }
]

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Navegacao principal">
      <div className="sidebar__brand">
        <span className="sidebar__brand-name">{APP_NAME}</span>
        <span className="sidebar__brand-tagline">{APP_TAGLINE}</span>
      </div>
      <ul className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                'sidebar__link' + (isActive ? ' sidebar__link--active' : '')
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
