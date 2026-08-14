import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import type { EditProjectResponse } from '@shared/schemas/editor.schema'

/**
 * EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). Visao geral de TODOS os projetos de
 * edicao (de qualquer gravacao) - equivalente a Biblioteca, mas para edicoes em vez de gravacoes.
 * Um projeto de edicao e criado a partir de uma gravacao concluida (botao "Editar" na
 * Biblioteca); esta tela so lista/abre os ja existentes.
 */
export function EditorListPage() {
  const [editProjects, setEditProjects] = useState<EditProjectResponse[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.editor
      .list()
      .then((result) => {
        if (!cancelled) setEditProjects(result)
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
      <h1>Projetos</h1>
      {error && (
        <EmptyState message="Nao foi possivel carregar os projetos de edicao. Tente novamente." />
      )}
      {!error && editProjects && editProjects.length === 0 && (
        <EmptyState message='Nenhum projeto de edicao ainda. Na Biblioteca, clique em "Editar" numa gravacao concluida para comecar.' />
      )}
      {!error && editProjects && editProjects.length > 0 && (
        <ul className="library-list">
          {editProjects.map((editProject) => (
            <li key={editProject.id} className="library-list__item">
              <Link className="library-list__title" to={`/editor/${editProject.id}`}>
                {editProject.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
