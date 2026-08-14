import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { formatFileSize } from '../library/format-file-size'
import { formatElapsed } from '../recording/format-elapsed'
import { Timeline } from './Timeline'
import { pickPreviewTrack, isVideoTrackType } from './pick-preview-track'
import { buildMeetingMediaUrl } from '@shared/constants/media-protocol'
import type { EditProjectResponse, GetTimelineResponse } from '@shared/schemas/editor.schema'
import type { ProjectDetailsResponse } from '@shared/schemas/project.schema'

/**
 * EDIT-001/EDIT-002/EDIT-003 (decimo segundo/terceiro/quarto incrementos - Fase 3, Editor MVP).
 * Pagina de detalhe de UM projeto de edicao (`/editor/:id`) - metadados + resumo somente-leitura
 * da gravacao vinculada (reaproveitando `library.getDetails`, LIB-002) + a timeline compilada
 * (`Timeline.tsx`, EDIT-002) + um preview MINIMO de uma unica trilha (EDIT-003 - sem playhead
 * sincronizado com a timeline ainda, isso e um incremento futuro). Sem corte/split/undo-redo/
 * layout ainda (EDIT-004 em diante) - incrementos futuros deliberadamente separados dado o
 * tamanho da Fase 3.
 */
export function EditorProjectPage() {
  const { id } = useParams<{ id: string }>()
  const [editProject, setEditProject] = useState<EditProjectResponse | null>(null)
  const [recording, setRecording] = useState<ProjectDetailsResponse | null>(null)
  const [timeline, setTimeline] = useState<GetTimelineResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    window.meetingStudio.editor
      .get(id)
      .then((result) => {
        if (cancelled) return
        setEditProject(result)
        return Promise.all([
          window.meetingStudio.library.getDetails(result.projectId),
          window.meetingStudio.editor.getTimeline(result.id)
        ])
      })
      .then((results) => {
        if (cancelled || !results) return
        const [details, timelineResult] = results
        setRecording(details)
        setTimeline(timelineResult)
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
    <EditorProjectView editProject={editProject} recording={recording} timeline={timeline} />
  )
}

/**
 * EDIT-003 - preview MINIMO: uma unica trilha (`pickPreviewTrack`), primeiro clip, sem playhead
 * sincronizado com a timeline ainda (proximo incremento). `<video>`/`<audio src>` aponta pro
 * esquema customizado `meeting-media://` (`main/media/media-protocol.ts`) - a unica forma de
 * tocar midia local em Electron sem desativar `webSecurity` nem expor Node.js ao renderer.
 */
function EditorProjectView({
  editProject,
  recording,
  timeline
}: {
  editProject: EditProjectResponse
  recording: ProjectDetailsResponse | null
  timeline: GetTimelineResponse | null
}) {
  const preview = useMemo(() => {
    if (!timeline) return null
    const track = pickPreviewTrack(timeline.tracks)
    const clip = track?.clips[0]
    if (!track || !clip) return null
    return {
      isVideo: isVideoTrackType(track.type),
      src: buildMeetingMediaUrl(timeline.projectId, clip.relativePath)
    }
  }, [timeline])

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
      <h2>Preview</h2>
      {preview ? (
        preview.isVideo ? (
          <video controls src={preview.src} className="editor-preview" />
        ) : (
          <audio controls src={preview.src} className="editor-preview" />
        )
      ) : (
        <p>Sem midia para pre-visualizar.</p>
      )}
      <h2>Timeline</h2>
      {timeline ? (
        <Timeline timeline={timeline} />
      ) : (
        <p>Carregando timeline...</p>
      )}
      <EmptyState message="Cortar, dividir, desfazer/refazer e layout chegam nos proximos incrementos da Fase 3." />
    </div>
  )
}
