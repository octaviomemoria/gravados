import { EmptyState } from '../../components/EmptyState'

/** Placeholder - o editor (RF-019 a RF-031) e Fase 3 - Editor MVP. */
export function EditorPlaceholderPage() {
  return (
    <div className="feature-page">
      <h1>Projetos</h1>
      <EmptyState message="O editor de projetos chega na Fase 3 - Editor MVP." />
    </div>
  )
}
