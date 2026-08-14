import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { formatFileSize } from '../library/format-file-size'
import { formatElapsed } from '../recording/format-elapsed'
import type { EditProjectResponse } from '@shared/schemas/editor.schema'
import type { ProjectDetailsResponse } from '@shared/schemas/project.schema'

/**
 * EDIT-001 (decimo segundo incremento - Fase 3, Editor MVP). Pagina de detalhe de UM projeto de
 * edicao (`/editor/:id`) - por enquanto so metadados + um resumo somente-leitura da gravacao
 * vinculada (reaproveitando `library.getDetails`, ja existente desde LIB-002). A timeline em si
 * (EDIT-002+: playhead, corte, split, undo/redo, layout, preview) e um incremento futuro
 * deliberadamente separado - este e so o "abrir/criar projeto de edicao", a base sobre a qual a
 * timeline sera construida.
 */
export function EditorProjectPage() {
  const { id } = useParams<{ id: string }>()
  const [editProject, setEditProject] = useState<EditProjectResponse | null>(null)
  const [recording, setRecording] = useState<ProjectDetailsResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    window.meetingStudio.editor
      .get(id)
      .then((result) => {
        if (cancelled) return
        setEditProject(result)
        return window.meetingStudio.library.getDetails(result.projectId)
      })
      .then((details) => {
        if (!cancelled && details) setRecording(details)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <div className="feature-page">
        <h1>Projeto de edicao</h1>
        <EmptyState message="Nao foi possivel carregar este projeto de edicao." />
      </div>
    )
  }

  if (!editProject) {
    return (
      <div className="feature-page">
        <h1>Projeto de edicao</h1>
        <p>Carregando...</p>
      </div>
    )
  }

  return (
    <div className="feature-page">
      <h1>{editProject.name}</h1>
      <p>
        Revisao {editProject.revision} · criado em{' '}
        {new Date(editProject.createdAt).toLocaleString('pt-BR')}
      </p>
      {recording && (
        <p>
          Gravacao original: {recording.title}
          {recording.durationMs !== null && ` · ${formatElapsed(recording.durationMs)}`}
          {' · '}
          {formatFileSize(recording.totalBytes)}
        </p>
      )}
      <EmptyState message="A timeline de edicao (cortar, dividir, desfazer/refazer, layout) chega nos proximos incrementos da Fase 3." />
    </div>
  )
}
