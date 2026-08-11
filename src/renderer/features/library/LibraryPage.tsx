import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import type { ProjectResponse } from '@shared/schemas/project.schema'

/** RF-017: lista de reunioes. Consulta real via IPC (`library.list`, alias de `project.list`). */
export function LibraryPage() {
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null)
  const [error, setError] = useState(false)
  // Id do projeto cujo "Abrir pasta" acabou de falhar (pasta movida/apagada por fora do app) -
  // por projeto, nao global, para nao confundir qual item teve o problema numa lista longa.
  const [openFolderErrorId, setOpenFolderErrorId] = useState<string | null>(null)

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

  async function handleOpenFolder(projectId: string): Promise<void> {
    setOpenFolderErrorId(null)
    const { opened } = await window.meetingStudio.project.openFolder(projectId)
    if (!opened) setOpenFolderErrorId(projectId)
  }

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
            <li key={project.id} className="library-list__item">
              <span className="library-list__title">{project.title}</span>
              <Button variant="secondary" onClick={() => void handleOpenFolder(project.id)}>
                Abrir pasta
              </Button>
              {openFolderErrorId === project.id && (
                <p className="library-list__error">
                  Nao foi possivel abrir a pasta - ela pode ter sido movida ou apagada.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
