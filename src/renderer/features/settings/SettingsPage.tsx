import { useEffect, useState } from 'react'
import { ThemeToggle } from '../../components/ThemeToggle'

/** RF-041: configuracoes locais. Tema e persistido de verdade via IPC (`settings.app`). */
export function SettingsPage() {
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.settings
      .get('app')
      .then((settings) => {
        if (cancelled) return
        const value = settings.defaultLibraryRootPath
        setLibraryRoot(typeof value === 'string' ? value : null)
      })
      .catch(() => {
        if (!cancelled) setLibraryRoot(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="feature-page">
      <h1>Configuracoes</h1>

      <section className="settings-section">
        <h2>Tema</h2>
        <ThemeToggle />
      </section>

      <section className="settings-section">
        <h2>Pasta padrao da biblioteca</h2>
        <p className="settings-readonly-value">{libraryRoot ?? 'Carregando...'}</p>
      </section>
    </div>
  )
}
