import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { formatFileSize } from '../library/format-file-size'
import { formatElapsed } from '../recording/format-elapsed'
import { Timeline } from './Timeline'
import { isVideoTrackType, computePreviewLayout } from './pick-preview-track'
import { useMultiTrackPlayback } from './useMultiTrackPlayback'
import type {
  EditProjectResponse,
  GetEditedTimelineResponse,
  CameraTransform,
  LayoutPreset
} from '@shared/schemas/editor.schema'
import type { ProjectDetailsResponse } from '@shared/schemas/project.schema'

/** EDIT-010 - posicao/tamanho/forma da trilha CAMERA overlay, convertidos em CSS inline
 * (porcentagens relativas ao container `.editor-preview-container`, ver global.css). */
function cameraOverlayStyle(transform: CameraTransform): CSSProperties {
  return {
    left: `${transform.xPercent}%`,
    top: `${transform.yPercent}%`,
    width: `${transform.widthPercent}%`,
    height: `${transform.heightPercent}%`,
    borderRadius: transform.shape === 'circle' ? '50%' : undefined
  }
}

/** EDIT-011 - rotulos em portugues pro select de layout, mesmo padrao de `TRACK_TYPE_LABELS`. */
const LAYOUT_PRESET_LABELS: Record<LayoutPreset, string> = {
  PIP: 'Picture-in-picture (câmera sobre a tela)',
  SIDE_BY_SIDE: 'Lado a lado',
  SCREEN_ONLY: 'Só tela',
  CAMERA_ONLY: 'Só câmera'
}

/**
 * EDIT-001/EDIT-002/EDIT-003/EDIT-004-005-006/EDIT-007/EDIT-008/EDIT-009/EDIT-010/EDIT-011 (Fase
 * 3, Editor MVP). Pagina de detalhe de UM projeto de edicao (`/editor/:id`) - metadados + resumo
 * somente-leitura da gravacao vinculada (reaproveitando `library.getDetails`, LIB-002) + a
 * timeline EDITADA (`Timeline.tsx`, EDIT-002/EDIT-004-005-006/EDIT-008/EDIT-009/EDIT-010) + o
 * player multi-trilha sincronizado (`useMultiTrackPlayback`, EDIT-003 parte 2) + corte/split/
 * remover-intervalo (EDIT-004/005/006 - todos o mesmo primitivo `REMOVE_RANGE`, ver
 * `RemoveRangeRequestSchema`) + desfazer/refazer (EDIT-007) + ganho/mudo (EDIT-008) + fade in/out
 * (EDIT-009) + visibilidade/posicao/tamanho de camera (EDIT-010) por trilha + layout da composicao
 * (EDIT-011, PiP/lado-a-lado/so-tela/so-camera). Sem autosave ainda (EDIT-012 em diante).
 */
export function EditorProjectPage() {
  const { id } = useParams<{ id: string }>()
  const [editProject, setEditProject] = useState<EditProjectResponse | null>(null)
  const [recording, setRecording] = useState<ProjectDetailsResponse | null>(null)
  const [timeline, setTimeline] = useState<GetEditedTimelineResponse | null>(null)
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
          // EDIT-004/005/006 - a timeline que a UI mostra/reproduz e a EDITADA (bruta + log de
          // `edit_operations` ja aplicado), nao a bruta - o usuario precisa ver o resultado dos
          // proprios cortes, nao a gravacao original intocada.
          window.meetingStudio.editor.getEditedTimeline(result.id)
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
    // `key` forca remontagem (e reset do estado interno de `useMultiTrackPlayback`/selecao) se o
    // usuario navegar de um projeto de edicao para outro sem sair desta rota - o padrao
    // recomendado pelo React para "resetar estado quando um id muda", em vez de um efeito
    // chamando setState.
    <EditorProjectView
      key={editProject.id}
      editProject={editProject}
      recording={recording}
      initialTimeline={timeline}
    />
  )
}

/**
 * EDIT-003 parte 2 - player multi-trilha: TODAS as trilhas tocam em lockstep via
 * `useMultiTrackPlayback` (relogio mestre em software, cada elemento corrigido/trocado de arquivo
 * conforme cruza fronteiras de clip). So a trilha de video "principal" (`pickPreviewTrack` -
 * SCREEN > CAMERA > primeira disponivel) e exibida visualmente; as demais trilhas de VIDEO ficam
 * ocultas (`hidden`, prontas para um futuro layout picture-in-picture - EDIT-011) e as trilhas de
 * AUDIO tocam sem elemento visual proprio (nunca tem imagem) mas SAO OUVIDAS.
 *
 * EDIT-004/005/006 - mantem sua PROPRIA copia local da timeline (`editedTimeline`, sincronizada
 * com `initialTimeline` via efeito) em vez de depender so da prop - `removeRange` precisa poder
 * SUBSTITUIR a timeline exibida pela resposta ja recalculada do IPC, sem depender do componente
 * pai buscar tudo de novo.
 */
function EditorProjectView({
  editProject,
  recording,
  initialTimeline
}: {
  editProject: EditProjectResponse
  recording: ProjectDetailsResponse | null
  initialTimeline: GetEditedTimelineResponse | null
}) {
  const [timeline, setTimeline] = useState<GetEditedTimelineResponse | null>(initialTimeline)
  // `initialTimeline` chega `null` primeiro (carregamento assincrono, ver `EditorProjectPage`) e
  // muda de identidade quando o fetch resolve - precisa refletir em `timeline` sem um efeito
  // chamando `setState` (anti-padrao, `react-hooks/set-state-in-effect`). Ajustar o estado DURANTE
  // a renderizacao (comparando com a ultima prop vista) e o padrao recomendado pelo proprio React
  // pra "derivar estado de uma prop que muda" sem side effect nenhum.
  const [prevInitialTimeline, setPrevInitialTimeline] = useState(initialTimeline)
  if (initialTimeline !== prevInitialTimeline) {
    setPrevInitialTimeline(initialTimeline)
    setTimeline(initialTimeline)
  }

  const [selection, setSelection] = useState<{ startMs: number; endMs: number } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const playback = useMultiTrackPlayback(timeline)
  // EDIT-011 - unica fonte de verdade pra "o que desenhar no preview": qual(is) trilha(s) de
  // video ficam visiveis e em que arranjo (single/pip/side-by-side), decidido a partir do
  // `layoutPreset` da timeline editada + quais trilhas a gravacao realmente tem (ver comentario em
  // `computePreviewLayout`).
  const previewLayout = useMemo(() => {
    if (!timeline) return { mode: 'none' as const }
    return computePreviewLayout(timeline.tracks, timeline.layoutPreset)
  }, [timeline])
  const overlayCameraTransform = useMemo(() => {
    if (previewLayout.mode !== 'pip' || !timeline) return null
    return (
      timeline.tracks.find((track) => track.id === previewLayout.overlayTrackId)?.cameraTransform ??
      null
    )
  }, [previewLayout, timeline])

  const hasPlayableMedia = useMemo(
    () => !!timeline && timeline.tracks.some((track) => track.clips.length > 0),
    [timeline]
  )

  // EDIT-007 - depois de QUALQUER mutacao (corte, desfazer, refazer) o playhead pode ficar alem
  // do novo fim (mais curto) ou no meio de um trecho que nem existe mais na timeline resultante -
  // salta pro inicio sempre, comportamento previsivel (mesmo padrao de editores de video
  // convencionais: o preview "salta" pro resultado, nao tenta preservar uma posicao invalida).
  const applyTimelineMutation = useCallback(
    (updated: GetEditedTimelineResponse) => {
      setTimeline(updated)
      setSelection(null)
      playback.seek(0)
    },
    [playback]
  )

  const removeRange = useCallback(
    async (startMs: number, endMs: number) => {
      setActionError(null)
      setBusy(true)
      try {
        const updated = await window.meetingStudio.editor.removeRange(
          editProject.id,
          startMs,
          endMs
        )
        applyTimelineMutation(updated)
      } catch {
        setActionError('Nao foi possivel remover o trecho selecionado.')
      } finally {
        setBusy(false)
      }
    },
    [editProject.id, applyTimelineMutation]
  )

  const undo = useCallback(async () => {
    if (!timeline?.canUndo) return
    setActionError(null)
    setBusy(true)
    try {
      const updated = await window.meetingStudio.editor.undo(editProject.id)
      applyTimelineMutation(updated)
    } catch {
      setActionError('Nao foi possivel desfazer.')
    } finally {
      setBusy(false)
    }
  }, [editProject.id, timeline?.canUndo, applyTimelineMutation])

  const redo = useCallback(async () => {
    if (!timeline?.canRedo) return
    setActionError(null)
    setBusy(true)
    try {
      const updated = await window.meetingStudio.editor.redo(editProject.id)
      applyTimelineMutation(updated)
    } catch {
      setActionError('Nao foi possivel refazer.')
    } finally {
      setBusy(false)
    }
  }, [editProject.id, timeline?.canRedo, applyTimelineMutation])

  // EDIT-008 - NAO usa `applyTimelineMutation`: ajustar ganho/mudo nao invalida a posicao do
  // playhead nem a selecao em andamento (ao contrario de corte/desfazer/refazer, que podem
  // encurtar/reestruturar a timeline) - resetar o preview pro inicio a cada arrasto do slider
  // seria uma experiencia ruim. Tambem nao usa `busy` (desabilitaria a toolbar inteira a cada
  // evento de um `<input type="range">`, que dispara muitos eventos rapidos durante o arrasto).
  // Guard de sequencia (`gainRequestSeqRef`) descarta uma resposta desatualizada se o usuario
  // arrastar o slider mais rapido que o round-trip IPC - sem isso, uma resposta antiga chegando
  // DEPOIS de uma mais nova poderia sobrescrever o valor certo com um mais velho.
  const gainRequestSeqRef = useRef(0)
  const setTrackGain = useCallback(
    async (trackId: string, gainDb: number, muted: boolean) => {
      setActionError(null)
      const requestSeq = ++gainRequestSeqRef.current
      try {
        const updated = await window.meetingStudio.editor.setTrackGain(
          editProject.id,
          trackId,
          gainDb,
          muted
        )
        if (requestSeq !== gainRequestSeqRef.current) return
        setTimeline(updated)
      } catch {
        if (requestSeq === gainRequestSeqRef.current) {
          setActionError('Nao foi possivel ajustar o ganho da trilha.')
        }
      }
    },
    [editProject.id]
  )

  // EDIT-009 - mesmo padrao de `setTrackGain`: nao usa `applyTimelineMutation`/`busy`, guard de
  // sequencia proprio (`fadeRequestSeqRef`) independente do de ganho - ajustar fade e uma acao
  // diferente, nao deveria descartar uma resposta de ganho em andamento nem vice-versa.
  const fadeRequestSeqRef = useRef(0)
  const setTrackFade = useCallback(
    async (trackId: string, fadeInMs: number, fadeOutMs: number) => {
      setActionError(null)
      const requestSeq = ++fadeRequestSeqRef.current
      try {
        const updated = await window.meetingStudio.editor.setTrackFade(
          editProject.id,
          trackId,
          fadeInMs,
          fadeOutMs
        )
        if (requestSeq !== fadeRequestSeqRef.current) return
        setTimeline(updated)
      } catch {
        if (requestSeq === fadeRequestSeqRef.current) {
          setActionError('Nao foi possivel ajustar o fade da trilha.')
        }
      }
    },
    [editProject.id]
  )

  // EDIT-010 - mesmo padrao de `setTrackGain`/`setTrackFade`: nao usa `applyTimelineMutation`/
  // `busy`, guard de sequencia proprio (`transformRequestSeqRef`) independente dos outros dois -
  // arrastar um slider de posicao/tamanho nao deveria descartar (nem ser descartado por) um
  // ajuste de ganho ou fade em andamento.
  const transformRequestSeqRef = useRef(0)
  const setTrackTransform = useCallback(
    async (trackId: string, transform: CameraTransform) => {
      setActionError(null)
      const requestSeq = ++transformRequestSeqRef.current
      try {
        const updated = await window.meetingStudio.editor.setTrackCameraTransform(
          editProject.id,
          trackId,
          transform
        )
        if (requestSeq !== transformRequestSeqRef.current) return
        setTimeline(updated)
      } catch {
        if (requestSeq === transformRequestSeqRef.current) {
          setActionError('Nao foi possivel ajustar a transformacao da camera.')
        }
      }
    },
    [editProject.id]
  )

  // EDIT-011 - mesmo padrao de `setTrackGain`/`setTrackFade`/`setTrackTransform`: nao usa
  // `applyTimelineMutation`/`busy`, guard de sequencia proprio (`layoutRequestSeqRef`). Ao
  // contrario dos outros tres, nao recebe `trackId` - layout e uma propriedade da COMPOSICAO
  // inteira (ver comentario em `LayoutPresetSchema`).
  const layoutRequestSeqRef = useRef(0)
  const setLayoutPreset = useCallback(
    async (preset: LayoutPreset) => {
      setActionError(null)
      const requestSeq = ++layoutRequestSeqRef.current
      try {
        const updated = await window.meetingStudio.editor.setLayoutPreset(editProject.id, preset)
        if (requestSeq !== layoutRequestSeqRef.current) return
        setTimeline(updated)
      } catch {
        if (requestSeq === layoutRequestSeqRef.current) {
          setActionError('Nao foi possivel ajustar o layout.')
        }
      }
    },
    [editProject.id]
  )

  // `05_MEDIA_EDITOR.md` §15 - Ctrl+Z desfaz, Ctrl+Shift+Z refaz; atalhos nunca disparam com o
  // foco num campo de texto (aqui so o nome do projeto seria editavel num incremento futuro, mas
  // o guard ja fica pronto pra quando existir).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      const isTextInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (isTextInput) return
      if (!event.ctrlKey || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) void redo()
      else void undo()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  const markSelectionStart = useCallback(() => {
    setSelection((current) => ({
      startMs: Math.min(playback.playheadMs, current?.endMs ?? playback.totalMs),
      endMs: current?.endMs ?? playback.totalMs
    }))
  }, [playback.playheadMs, playback.totalMs])

  const markSelectionEnd = useCallback(() => {
    setSelection((current) => ({
      startMs: current?.startMs ?? 0,
      endMs: Math.max(playback.playheadMs, current?.startMs ?? 0)
    }))
  }, [playback.playheadMs])

  const trimStart = useCallback(() => {
    if (playback.playheadMs > 0) void removeRange(0, playback.playheadMs)
  }, [playback.playheadMs, removeRange])

  const trimEnd = useCallback(() => {
    if (playback.playheadMs < playback.totalMs) void removeRange(playback.playheadMs, playback.totalMs)
  }, [playback.playheadMs, playback.totalMs, removeRange])

  const removeSelection = useCallback(() => {
    if (selection && selection.startMs < selection.endMs) {
      void removeRange(selection.startMs, selection.endMs)
    }
  }, [selection, removeRange])

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
          <label className="editor-layout-select">
            Layout
            <select
              value={timeline.layoutPreset}
              onChange={(event) => void setLayoutPreset(event.target.value as LayoutPreset)}
            >
              {(Object.keys(LAYOUT_PRESET_LABELS) as LayoutPreset[]).map((preset) => (
                <option key={preset} value={preset}>
                  {LAYOUT_PRESET_LABELS[preset]}
                </option>
              ))}
            </select>
          </label>
          <div
            className={
              previewLayout.mode === 'side-by-side'
                ? 'editor-preview-container editor-preview-container--side-by-side'
                : 'editor-preview-container'
            }
          >
            {timeline.tracks.map((track) => {
              if (!isVideoTrackType(track.type)) {
                return (
                  <audio
                    key={track.id}
                    ref={playback.getTrackRef(track.id)}
                    hidden
                    data-track-type={track.type}
                  />
                )
              }
              const role: 'background' | 'overlay' | 'side' | 'hidden' =
                (previewLayout.mode === 'single' && track.id === previewLayout.trackId) ||
                (previewLayout.mode === 'pip' && track.id === previewLayout.backgroundTrackId)
                  ? 'background'
                  : previewLayout.mode === 'pip' && track.id === previewLayout.overlayTrackId
                    ? 'overlay'
                    : previewLayout.mode === 'side-by-side' &&
                        (track.id === previewLayout.leftTrackId ||
                          track.id === previewLayout.rightTrackId)
                      ? 'side'
                      : 'hidden'
              const className =
                role === 'overlay'
                  ? 'editor-preview-overlay'
                  : role === 'side'
                    ? 'editor-preview editor-preview--side'
                    : 'editor-preview'
              const ariaLabel =
                role === 'background'
                  ? 'editor-preview-video'
                  : role === 'overlay'
                    ? 'editor-preview-camera-overlay'
                    : role === 'side'
                      ? previewLayout.mode === 'side-by-side' && track.id === previewLayout.leftTrackId
                        ? 'editor-preview-side-left'
                        : 'editor-preview-side-right'
                      : undefined
              return (
                <video
                  key={track.id}
                  ref={playback.getTrackRef(track.id)}
                  className={className}
                  hidden={role === 'hidden'}
                  style={role === 'overlay' && overlayCameraTransform
                    ? cameraOverlayStyle(overlayCameraTransform)
                    : undefined}
                  aria-label={ariaLabel}
                />
              )
            })}
          </div>
          <div className="editor-player-controls">
            <button type="button" onClick={playback.togglePlay} disabled={playback.totalMs === 0}>
              {playback.isPlaying ? 'Pausar' : 'Reproduzir'}
            </button>
            <span className="editor-player-controls__time" role="status">
              {formatElapsed(playback.playheadMs)} / {formatElapsed(playback.totalMs)}
            </span>
          </div>
          <div className="editor-edit-controls">
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy || !timeline.canUndo}
              title="Ctrl+Z"
            >
              Desfazer
            </button>
            <button
              type="button"
              onClick={() => void redo()}
              disabled={busy || !timeline.canRedo}
              title="Ctrl+Shift+Z"
            >
              Refazer
            </button>
            <button type="button" onClick={trimStart} disabled={busy || playback.playheadMs === 0}>
              Cortar antes daqui
            </button>
            <button
              type="button"
              onClick={trimEnd}
              disabled={busy || playback.playheadMs >= playback.totalMs}
            >
              Cortar depois daqui
            </button>
            <button type="button" onClick={markSelectionStart} disabled={busy}>
              Marcar inicio da selecao
            </button>
            <button type="button" onClick={markSelectionEnd} disabled={busy}>
              Marcar fim da selecao
            </button>
            <button
              type="button"
              onClick={removeSelection}
              disabled={busy || !selection || selection.startMs >= selection.endMs}
            >
              Remover trecho selecionado
            </button>
            {selection && (
              <span className="editor-edit-controls__selection" role="status">
                Selecao: {formatElapsed(selection.startMs)} - {formatElapsed(selection.endMs)}
              </span>
            )}
          </div>
          {actionError && (
            <p className="editor-edit-controls__error" role="alert">
              {actionError}
            </p>
          )}
        </>
      ) : (
        <p>Sem midia para pre-visualizar.</p>
      )}
      <h2>Timeline</h2>
      {timeline ? (
        <Timeline
          timeline={timeline}
          currentTimeMs={playback.playheadMs}
          onSeek={playback.seek}
          selection={selection}
          onSetTrackGain={(trackId, gainDb, muted) => void setTrackGain(trackId, gainDb, muted)}
          onSetTrackFade={(trackId, fadeInMs, fadeOutMs) =>
            void setTrackFade(trackId, fadeInMs, fadeOutMs)
          }
          onSetTrackCameraTransform={(trackId, transform) =>
            void setTrackTransform(trackId, transform)
          }
        />
      ) : (
        <p>Carregando timeline...</p>
      )}
      <EmptyState message="Autosave chega nos proximos incrementos da Fase 3." />
    </div>
  )
}
