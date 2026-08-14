import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { formatFileSize } from '../library/format-file-size'
import { formatElapsed } from '../recording/format-elapsed'
import { Timeline } from './Timeline'
import { pickPreviewTrack, isVideoTrackType } from './pick-preview-track'
import { useMultiTrackPlayback } from './useMultiTrackPlayback'
import type { EditProjectResponse, GetTimelineResponse } from '@shared/schemas/editor.schema'
import type { ProjectDetailsResponse } from '@shared/schemas/project.schema'

/**
 * EDIT-001/EDIT-002/EDIT-003 (decimo segundo/terceiro/quarto/sexto incrementos - Fase 3, Editor
 * MVP). Pagina de detalhe de UM projeto de edicao (`/editor/:id`) - metadados + resumo
 * somente-leitura da gravacao vinculada (reaproveitando `library.getDetails`, LIB-002) + a
 * timeline compilada (`Timeline.tsx`, EDIT-002) + o player multi-trilha sincronizado
 * (`useMultiTrackPlayback`, EDIT-003 parte 2). Sem corte/split/undo-redo/layout ainda (EDIT-004
 * em diante) - incrementos futuros deliberadamente separados dado o tamanho da Fase 3.
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
    // `key` forca remontagem (e reset do estado interno de `useMultiTrackPlayback`) se o usuario
    // navegar de um projeto de edicao para outro sem sair desta rota - o padrao recomendado pelo
    // React para "resetar estado quando um id muda", em vez de um efeito chamando setState.
    <EditorProjectView
      key={editProject.id}
      editProject={editProject}
      recording={recording}
      timeline={timeline}
    />
  )
}

/**
 * EDIT-003 parte 2 - player multi-trilha: TODAS as trilhas tocam em lockstep via
 * `useMultiTrackPlayback` (relogio mestre em software, cada elemento corrigido/trocado de arquivo
 * conforme cruza fronteiras de clip). So a trilha de video "principal" (`pickPreviewTrack` -
 * SCREEN > CAMERA > primeira disponivel) e exibida visualmente; as demais trilhas de VIDEO ficam
 * ocultas (`hidden`, prontas para um futuro layout picture-in-picture - EDIT-011) e as trilhas de
 * AUDIO tocam sem elemento visual proprio (nunca tem imagem) mas SAO OUVIDAS - e assim que
 * microfone/audio do sistema se somam ao vivo durante a reproducao, nao so a trilha escolhida
 * pro preview.
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
  const playback = useMultiTrackPlayback(timeline)
  const primaryTrackId = useMemo(() => {
    if (!timeline) return null
    return pickPreviewTrack(timeline.tracks)?.id ?? null
  }, [timeline])

  const hasPlayableMedia = useMemo(
    () => !!timeline && timeline.tracks.some((track) => track.clips.length > 0),
    [timeline]
  )

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
      {timeline && hasPlayableMedia ? (
        <>
          {timeline.tracks.map((track) => {
            const isVideo = isVideoTrackType(track.type)
            const isPrimary = track.id === primaryTrackId
            if (isVideo) {
              return (
                <video
                  key={track.id}
                  ref={playback.getTrackRef(track.id)}
                  className="editor-preview"
                  hidden={!isPrimary}
                  aria-label={isPrimary ? 'editor-preview-video' : undefined}
                />
              )
            }
            return (
              <audio key={track.id} ref={playback.getTrackRef(track.id)} hidden data-track-type={track.type} />
            )
          })}
          <div className="editor-player-controls">
            <button type="button" onClick={playback.togglePlay} disabled={playback.totalMs === 0}>
              {playback.isPlaying ? 'Pausar' : 'Reproduzir'}
            </button>
            <span className="editor-player-controls__time" role="status">
              {formatElapsed(playback.playheadMs)} / {formatElapsed(playback.totalMs)}
            </span>
          </div>
        </>
      ) : (
        <p>Sem midia para pre-visualizar.</p>
      )}
      <h2>Timeline</h2>
      {timeline ? (
        <Timeline timeline={timeline} currentTimeMs={playback.playheadMs} onSeek={playback.seek} />
      ) : (
        <p>Carregando timeline...</p>
      )}
      <EmptyState message="Cortar, dividir, desfazer/refazer e layout chegam nos proximos incrementos da Fase 3." />
    </div>
  )
}
