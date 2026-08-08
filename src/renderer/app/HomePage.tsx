import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { DiskSpaceIndicator } from '../components/DiskSpaceIndicator'
import { APP_NAME, APP_TAGLINE } from '@shared/constants/app-info'

/**
 * 08_UX_FLOWS.md secao 2 + prompt do usuario: titulo/subtitulo, CTA "Nova gravacao", cards de
 * gravacoes recentes/projetos de edicao/exportacoes. Cards usam dados mockados (vazio) nesta
 * fase - a Biblioteca e as Exportacoes ja consultam o backend real (ver `features/library`,
 * `features/exports`); aqui a Home permanece simples por design, conforme permitido pelo prompt.
 */
export function HomePage() {
  return (
    <div className="home-page">
      <header className="home-page__header">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="home-page__tagline">{APP_TAGLINE}</p>
        </div>
        <DiskSpaceIndicator />
      </header>

      <Link to="/recording" className="button button--primary">
        Nova gravacao
      </Link>

      <div className="home-page__cards">
        <Card title="Gravacoes recentes">
          <EmptyState message="Nenhuma gravacao ainda. Crie sua primeira reuniao para comecar." />
        </Card>
        <Card title="Projetos de edicao">
          <EmptyState message="Nenhum projeto de edicao ainda." />
        </Card>
        <Card title="Exportacoes">
          <EmptyState message="Nenhuma exportacao ainda." />
        </Card>
      </div>
    </div>
  )
}
