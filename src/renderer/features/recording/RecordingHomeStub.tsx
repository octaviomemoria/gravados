import { EmptyState } from '../../components/EmptyState'

/** Placeholder - a configuracao real de gravacao (RF-001 a RF-008) e Fase 1 - Recording Core. */
export function RecordingHomeStub() {
  return (
    <div className="feature-page">
      <h1>Nova gravacao</h1>
      <EmptyState message="A configuracao de gravacao (tela, camera, microfone) chega na Fase 1 - Recording Core." />
    </div>
  )
}
