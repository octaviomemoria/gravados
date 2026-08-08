import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { ProjectResponse } from '@shared/schemas/project.schema'

/** RF-017: lista de reunioes. Consulta real via IPC (`library.list`, alias de `project.list`). */
export function LibraryPage() {
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.library
      .list()
      .then((result) => {
        if (!cancelled) setProjects(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="feature-page">
      <h1>Biblioteca</h1>
      {error && <EmptyState message="Nao foi possivel carregar a biblioteca. Tente novamente." />}
      {!error && projects && projects.length === 0 && (
        <EmptyState message="Nenhuma gravacao ainda. Crie sua primeira reuniao para comecar." />
      )}
      {!error && projects && projects.length > 0 && (
        <ul className="library-list">
          {projects.map((project) => (
            <li key={project.id}>{project.title}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
