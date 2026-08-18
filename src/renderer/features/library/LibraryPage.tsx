import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import { formatFileSize } from './format-file-size'
import { formatElapsed } from '../recording/format-elapsed'
import { TRACK_TYPE_LABELS } from './track-type-labels'
import { pickPreviewTrack, isVideoTrackType } from '@shared/media/preview-layout'
import { buildMeetingMediaUrl } from '@shared/constants/media-protocol'
import type { ProjectResponse, ProjectDetailsResponse } from '@shared/schemas/project.schema'
import type { MarkerResponse } from '@shared/schemas/markers.schema'
import type { TranscriptionJobResponse, TranscriptResponse } from '@shared/schemas/transcription.schema'
import { transcriptDisplayText } from './transcript-display-text'

/**
 * RECOV-002/RECOV-003 (decimo incremento - Fase 2, recuperacao). Um projeto chega com
 * `status: 'RECOVERABLE'` quando o app detecta, no proprio boot, que a sessao de gravacao dele
 * nunca chegou a `COMPLETED`/`FAILED` no processo anterior (crash, encerramento forcado, queda de
 * energia) - ver `main/services/recovery.service.ts`. `FAILED` cobre tanto uma gravacao que
 * realmente falhou quanto um reparo que nao encontrou nenhum segmento aproveitavel.
 */
function isRecoverable(status: ProjectResponse['status']): boolean {
  return status === 'RECOVERABLE'
}

/** EDIT-001 (Fase 3 - Editor MVP): so uma gravacao `COMPLETED` pode virar um projeto de edicao -
 * editar uma gravacao ainda em andamento ou incompleta corromperia arquivos ainda em uso. */
function isCompleted(status: ProjectResponse['status']): boolean {
  return status === 'COMPLETED'
}

/** AI-001 - mesmo raciocinio de `EXPORT_STATUS_LABELS` (`EditorProjectPage.tsx`). */
const TRANSCRIPTION_STATUS_LABELS: Record<TranscriptionJobResponse['status'], string> = {
  QUEUED: 'Na fila',
  RUNNING: 'Transcrevendo',
  COMPLETED: 'Concluida',
  FAILED: 'Falhou',
  CANCELED: 'Cancelada'
}

/**
 * Refinamento pos-AI-002-LOCAL - player MINIMO dos detalhes expandidos: so o PRIMEIRO segmento
 * finalizado da trilha "principal" (mesma prioridade tela>câmera>primeira disponível de
 * `pickPreviewTrack`, já usada no editor desde a Fase 3). Não sincroniza múltiplas trilhas nem
 * concatena múltiplos segmentos de uma trilha rotacionada - mesmo espírito da primeira versão do
 * preview do editor (EDIT-003, antes da sincronização multi-track); suficiente pra "ouvir o
 * trecho" que um resultado de busca aponta, desde que o instante caia dentro do primeiro
 * segmento. Retorna `null` quando nenhuma trilha tem segmento finalizado algum.
 */
function pickPreviewSource(
  tracks: ProjectDetailsResponse['tracks']
): { relativePath: string; isVideo: boolean } | null {
  const tracksWithSegments = tracks.filter((track) => track.segments.length > 0)
  const track = pickPreviewTrack(tracksWithSegments)
  if (!track) return null
  return { relativePath: track.segments[0]!.relativePath, isVideo: isVideoTrackType(track.type) }
}

/** RF-017: lista de reunioes. Consulta real via IPC (`library.list`, alias de `project.list`). */
export function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Refinamento pos-AI-002-LOCAL - deep-link de um resultado de busca (`SearchPage.tsx`):
  // `?projectId=...&startMs=...` expande automaticamente aquele projeto e posiciona o player no
  // instante exato. Lido uma unica vez na montagem (`useState` inicializado por funcao, nao um
  // `useEffect` disparando em toda mudanca de searchParams) - navegar embora e voltar pra
  // Biblioteca sem esses parametros nao deveria reabrir o ultimo projeto visto.
  const [deepLinkProjectId] = useState(() => searchParams.get('projectId'))
  const [deepLinkStartMs] = useState(() => {
    const raw = searchParams.get('startMs')
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : null
  })
  const playerRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null)
  const [error, setError] = useState(false)
  // Id do projeto cujo "Abrir pasta" acabou de falhar (pasta movida/apagada por fora do app) -
  // por projeto, nao global, para nao confundir qual item teve o problema numa lista longa.
  const [openFolderErrorId, setOpenFolderErrorId] = useState<string | null>(null)
  // Id do projeto cujo reparo esta em andamento agora - desabilita o botao so daquele item
  // (repares de projetos diferentes sao independentes, podem rodar um apos o outro sem se
  // atrapalhar, ja que cada `recovery.repair` e uma chamada IPC isolada sem estado compartilhado).
  const [repairingId, setRepairingId] = useState<string | null>(null)
  const [repairErrorId, setRepairErrorId] = useState<string | null>(null)

  // LIB-002: detalhes (trilhas/segmentos/tamanho) buscados sob demanda ao expandir - nao junto com
  // a lista inteira, que so precisa do resumo ja presente em `ProjectResponse`.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [details, setDetails] = useState<ProjectDetailsResponse | null>(null)
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null)
  const [detailsErrorId, setDetailsErrorId] = useState<string | null>(null)

  // RF-016 - marcadores (timestamp/titulo/nota) buscados junto com os detalhes, mesmo padrao de
  // "sob demanda ao expandir" - `markers.list` ja existia desde a Fase 1, nunca tinha nenhuma UI
  // consumindo (so era exercitado por teste). Falha ao buscar marcadores NAO impede o resto dos
  // detalhes de aparecer (ver `handleToggleDetails`) - sao dados independentes.
  const [markers, setMarkers] = useState<MarkerResponse[] | null>(null)

  // Refinamento pós-LIB-PLAYER - edição/exclusão de marcadores, mesmo padrão já usado pra
  // renomear/excluir um projeto (edição inline + confirmação explícita antes de excluir).
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null)
  const [markerEditTitle, setMarkerEditTitle] = useState('')
  const [markerEditNote, setMarkerEditNote] = useState('')
  const [markerSavingId, setMarkerSavingId] = useState<string | null>(null)
  const [markerErrorId, setMarkerErrorId] = useState<string | null>(null)
  const [confirmDeleteMarkerId, setConfirmDeleteMarkerId] = useState<string | null>(null)
  const [markerDeletingId, setMarkerDeletingId] = useState<string | null>(null)

  // AI-001 (Fase 5 - Transcrição) - mesmo padrao "sob demanda ao expandir" de `markers`/`details`.
  // `transcriptionJob` e sempre o mais RECENTE (a lista ja vem ordenada por `createdAt` desc,
  // `TranscriptionJobRepository.listByProject`) - nunca mais de um "em voo" por vez nesta UI.
  const [transcriptionJob, setTranscriptionJob] = useState<TranscriptionJobResponse | null>(null)
  const [transcriptionBusy, setTranscriptionBusy] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)

  // Refinamento pos-MVP (pedido real do usuario - "onde encontro a transcricao?" + "um botao de
  // abrir transcricao com caixa de texto editavel, copiar, editar"). So carregado sob demanda ao
  // clicar "Ver transcricao" (nao junto com `transcriptionJob` acima) - a maioria das vezes que os
  // detalhes sao expandidos o usuario so quer ver status/marcadores, sem precisar buscar o texto
  // inteiro do transcript.
  const [transcriptOpenId, setTranscriptOpenId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptViewError, setTranscriptViewError] = useState<string | null>(null)
  const [transcriptEditing, setTranscriptEditing] = useState(false)
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [transcriptSaving, setTranscriptSaving] = useState(false)
  const [transcriptCopied, setTranscriptCopied] = useState(false)

  // LIB-004: edicao inline do titulo. Refinamento posterior: `notes` (sem UI dedicada ate entao,
  // ver README "Pendências conhecidas") passa a ser editavel no MESMO formulario - reusa
  // `renamingId`/`renameSavingId`/`renameErrorId`, nunca um segundo fluxo de edicao paralelo.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameNotesDraft, setRenameNotesDraft] = useState('')
  const [renameSavingId, setRenameSavingId] = useState<string | null>(null)
  const [renameErrorId, setRenameErrorId] = useState<string | null>(null)

  // LIB-006: exclusao permanente exige um segundo clique de confirmacao - acao irreversivel.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null)

  // EDIT-001: "Editar" cria um novo projeto de edicao e navega direto pra ele.
  const [creatingEditId, setCreatingEditId] = useState<string | null>(null)
  const [createEditErrorId, setCreateEditErrorId] = useState<string | null>(null)

  // Sem guarda de "cancelado" (diferente do `useEffect` de montagem abaixo) - reusada so apos uma
  // acao explicita do usuario (reparo/renomear/excluir) enquanto a pagina ja esta montada, nunca
  // numa corrida com desmontagem.
  function loadProjects(): void {
    window.meetingStudio.library
      .list()
      .then((result) => setProjects(result))
      .catch(() => setError(true))
  }

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

  // Refinamento pos-AI-002-LOCAL - expande automaticamente o projeto do deep-link assim que a
  // lista carrega (precisa da lista carregada so pra `handleToggleDetails` funcionar igual a um
  // clique manual - a funcao nao depende da lista em si, so do `projectId`).
  useEffect(() => {
    if (deepLinkProjectId && projects) {
      void handleToggleDetails(deepLinkProjectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so na primeira vez que `projects` deixa de ser null.
  }, [projects !== null])

  // AI-001 - enquanto o job de transcricao estiver QUEUED/RUNNING, consulta
  // `transcription.getStatus` a cada 1s, mesmo padrao ja usado pra progresso de exportacao em
  // `EditorProjectPage.tsx` - para sozinho assim que o job sai desses dois estados (nesta fase,
  // sempre `FAILED`).
  useEffect(() => {
    if (!transcriptionJob || (transcriptionJob.status !== 'QUEUED' && transcriptionJob.status !== 'RUNNING')) {
      return
    }
    let cancelled = false
    const intervalId = window.setInterval(() => {
      window.meetingStudio.transcription
        .getStatus(transcriptionJob.id)
        .then((updated) => {
          if (!cancelled) setTranscriptionJob(updated)
        })
        .catch(() => {
          /* falha transitoria de polling - tenta de novo no proximo tick */
        })
    }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [transcriptionJob])

  async function handleOpenFolder(projectId: string): Promise<void> {
    setOpenFolderErrorId(null)
    const { opened } = await window.meetingStudio.project.openFolder(projectId)
    if (!opened) setOpenFolderErrorId(projectId)
  }

  async function handleRepair(projectId: string): Promise<void> {
    setRepairErrorId(null)
    setRepairingId(projectId)
    try {
      await window.meetingStudio.recovery.repair(projectId)
      // Recarrega a lista inteira em vez de corrigir o item localmente - o reparo tambem pode
      // ter mudado `durationMs`/`endedAt`, que a lista ja exibe/exibira no futuro (LIB-002).
      loadProjects()
    } catch {
      setRepairErrorId(projectId)
    } finally {
      setRepairingId(null)
    }
  }

  async function handleToggleDetails(projectId: string): Promise<void> {
    if (expandedId === projectId) {
      setExpandedId(null)
      return
    }
    setDetailsErrorId(null)
    setExpandedId(projectId)
    setDetails(null)
    setMarkers(null)
    setTranscriptionJob(null)
    setTranscriptionError(null)
    setTranscriptOpenId(null)
    setTranscript(null)
    setTranscriptViewError(null)
    setTranscriptEditing(false)
    setDetailsLoadingId(projectId)
    try {
      const result = await window.meetingStudio.library.getDetails(projectId)
      setDetails(result)
    } catch {
      setDetailsErrorId(projectId)
    } finally {
      setDetailsLoadingId(null)
    }
    // RF-016 - busca separada de `getDetails` de proposito: uma falha aqui nao deveria impedir o
    // resto dos detalhes (duracao/trilhas/tamanho) de aparecer - `markers` fica `[]` nesse caso,
    // renderizando como "sem marcadores" em vez de um erro bloqueando a secao inteira.
    try {
      const result = await window.meetingStudio.markers.list(projectId)
      setMarkers(result)
    } catch {
      setMarkers([])
    }
    // AI-001 - mesmo raciocinio de independencia de `markers` acima; `transcriptionJob` fica
    // `null` (renderiza so o botao "Transcrever", sem status nenhum) se a busca falhar.
    try {
      const jobs = await window.meetingStudio.transcription.list(projectId)
      setTranscriptionJob(jobs[0] ?? null)
    } catch {
      setTranscriptionJob(null)
    }
  }

  function handleStartMarkerEdit(marker: MarkerResponse): void {
    setMarkerErrorId(null)
    setEditingMarkerId(marker.id)
    setMarkerEditTitle(marker.title ?? '')
    setMarkerEditNote(marker.note ?? '')
  }

  function handleCancelMarkerEdit(): void {
    setEditingMarkerId(null)
    setMarkerEditTitle('')
    setMarkerEditNote('')
  }

  /** Refinamento pós-LIB-PLAYER - campo vazio salva como `null` (limpa), nao como string vazia
   * (o schema `UpdateMarkerRequestSchema` rejeita string vazia via `.min(1)`, mesma regra ja
   * usada na criacao em `AddMarkerRequestSchema`). */
  async function handleSaveMarkerEdit(markerId: string): Promise<void> {
    setMarkerErrorId(null)
    setMarkerSavingId(markerId)
    try {
      const updated = await window.meetingStudio.markers.update(markerId, {
        title: markerEditTitle.trim() === '' ? null : markerEditTitle.trim(),
        note: markerEditNote.trim() === '' ? null : markerEditNote.trim()
      })
      setMarkers((current) => current?.map((m) => (m.id === markerId ? updated : m)) ?? null)
      setEditingMarkerId(null)
    } catch {
      setMarkerErrorId(markerId)
    } finally {
      setMarkerSavingId(null)
    }
  }

  async function handleDeleteMarker(markerId: string): Promise<void> {
    setMarkerErrorId(null)
    setMarkerDeletingId(markerId)
    try {
      await window.meetingStudio.markers.delete(markerId)
      setMarkers((current) => current?.filter((m) => m.id !== markerId) ?? null)
      setConfirmDeleteMarkerId(null)
    } catch {
      setMarkerErrorId(markerId)
    } finally {
      setMarkerDeletingId(null)
    }
  }

  /** AI-001 - `transcription.start` SEMPRE enfileira com sucesso (mesmas validacoes que uma
   * integracao real teria), mas o job criado ainda pode estar `QUEUED`/`RUNNING` no instante em
   * que a chamada retorna - o polling abaixo (`useEffect`) segue ate um estado terminal, que
   * nesta fase e sempre `FAILED` com uma mensagem clara (nenhum provedor conectado ainda). */
  async function handleStartTranscription(projectId: string): Promise<void> {
    setTranscriptionError(null)
    setTranscriptionBusy(true)
    try {
      const job = await window.meetingStudio.transcription.start(projectId)
      setTranscriptionJob(job)
    } catch {
      setTranscriptionError('Nao foi possivel iniciar a transcricao.')
    } finally {
      setTranscriptionBusy(false)
    }
  }

  /** Refinamento pos-MVP - abre/fecha a caixa de texto da transcricao. Busca sob demanda (nao
   * junto com `handleToggleDetails`, ver comentario no estado acima); fechar (segundo clique)
   * descarta qualquer edicao em andamento sem salvar, mesmo espirito do "Cancelar" abaixo. */
  async function handleToggleTranscriptView(projectId: string): Promise<void> {
    if (transcriptOpenId === projectId) {
      setTranscriptOpenId(null)
      setTranscript(null)
      setTranscriptEditing(false)
      return
    }
    setTranscriptViewError(null)
    setTranscriptOpenId(projectId)
    setTranscript(null)
    setTranscriptEditing(false)
    setTranscriptLoading(true)
    try {
      const result = await window.meetingStudio.transcription.getTranscript(projectId)
      setTranscript(result)
    } catch {
      setTranscriptViewError('Nao foi possivel carregar a transcricao.')
    } finally {
      setTranscriptLoading(false)
    }
  }

  async function handleCopyTranscript(): Promise<void> {
    if (!transcript) return
    try {
      await navigator.clipboard.writeText(transcriptDisplayText(transcript))
      setTranscriptCopied(true)
      window.setTimeout(() => setTranscriptCopied(false), 2000)
    } catch {
      setTranscriptViewError('Nao foi possivel copiar - verifique a permissao de area de transferencia.')
    }
  }

  function handleStartTranscriptEdit(): void {
    if (!transcript) return
    setTranscriptViewError(null)
    setTranscriptDraft(transcriptDisplayText(transcript))
    setTranscriptEditing(true)
  }

  function handleCancelTranscriptEdit(): void {
    setTranscriptEditing(false)
    setTranscriptDraft('')
  }

  async function handleSaveTranscriptEdit(projectId: string): Promise<void> {
    setTranscriptViewError(null)
    setTranscriptSaving(true)
    try {
      const updated = await window.meetingStudio.transcription.updateText(projectId, transcriptDraft)
      setTranscript(updated)
      setTranscriptEditing(false)
    } catch {
      setTranscriptViewError('Nao foi possivel salvar a edicao.')
    } finally {
      setTranscriptSaving(false)
    }
  }

  function handleStartRename(project: ProjectResponse): void {
    setRenameErrorId(null)
    setRenamingId(project.id)
    setRenameDraft(project.title)
    setRenameNotesDraft(project.notes ?? '')
  }

  function handleCancelRename(): void {
    setRenamingId(null)
    setRenameDraft('')
    setRenameNotesDraft('')
  }

  async function handleSaveRename(projectId: string): Promise<void> {
    const title = renameDraft.trim()
    if (title.length === 0) {
      setRenameErrorId(projectId)
      return
    }
    setRenameErrorId(null)
    setRenameSavingId(projectId)
    try {
      const trimmedNotes = renameNotesDraft.trim()
      await window.meetingStudio.project.rename(projectId, title, trimmedNotes === '' ? null : trimmedNotes)
      setRenamingId(null)
      loadProjects()
    } catch {
      setRenameErrorId(projectId)
    } finally {
      setRenameSavingId(null)
    }
  }

  async function handleCreateEdit(projectId: string): Promise<void> {
    setCreateEditErrorId(null)
    setCreatingEditId(projectId)
    try {
      const editProject = await window.meetingStudio.editor.create(projectId)
      navigate(`/editor/${editProject.id}`)
    } catch {
      setCreateEditErrorId(projectId)
      setCreatingEditId(null)
    }
  }

  async function handleConfirmDelete(projectId: string): Promise<void> {
    setDeleteErrorId(null)
    setDeletingId(projectId)
    try {
      await window.meetingStudio.project.delete(projectId)
      setConfirmDeleteId(null)
      if (expandedId === projectId) setExpandedId(null)
      loadProjects()
    } catch {
      setDeleteErrorId(projectId)
    } finally {
      setDeletingId(null)
    }
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
              {renamingId === project.id ? (
                <span className="library-list__rename">
                  <input
                    className="library-list__rename-input"
                    aria-label="Novo titulo da reuniao"
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                  />
                  {/* Refinamento pos-LIB-004 - `notes` ganha edicao aqui, no MESMO formulario do
                      titulo (nunca um segundo botao/fluxo "editar notas" separado). Campo vazio
                      salva como `null` (limpa), nunca string vazia (ver `handleSaveRename`). */}
                  <textarea
                    className="library-list__rename-notes"
                    aria-label="Notas da reuniao"
                    placeholder="Notas (opcional)"
                    value={renameNotesDraft}
                    onChange={(event) => setRenameNotesDraft(event.target.value)}
                    maxLength={2000}
                  />
                  <Button
                    variant="secondary"
                    disabled={renameSavingId === project.id}
                    onClick={() => void handleSaveRename(project.id)}
                  >
                    Salvar
                  </Button>
                  <Button variant="secondary" onClick={handleCancelRename}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <span className="library-list__title">
                  {project.title}
                  {isRecoverable(project.status) && (
                    <span className="library-list__badge" role="status">
                      Incompleta
                    </span>
                  )}
                  {project.notes && <p className="library-list__notes">{project.notes}</p>}
                </span>
              )}

              {renamingId !== project.id && (
                <>
                  <Button variant="secondary" onClick={() => void handleToggleDetails(project.id)}>
                    {expandedId === project.id ? 'Ocultar detalhes' : 'Detalhes'}
                  </Button>
                  {isRecoverable(project.status) && (
                    <Button
                      variant="secondary"
                      disabled={repairingId === project.id}
                      onClick={() => void handleRepair(project.id)}
                    >
                      {repairingId === project.id ? 'Reparando...' : 'Reparar'}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => void handleOpenFolder(project.id)}>
                    Abrir pasta
                  </Button>
                  {isCompleted(project.status) && (
                    <Button
                      variant="secondary"
                      disabled={creatingEditId === project.id}
                      onClick={() => void handleCreateEdit(project.id)}
                    >
                      {creatingEditId === project.id ? 'Abrindo...' : 'Editar'}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => handleStartRename(project)}>
                    Renomear
                  </Button>
                  {confirmDeleteId === project.id ? (
                    <span className="library-list__delete-confirm">
                      <span>Excluir permanentemente?</span>
                      <Button
                        variant="secondary"
                        disabled={deletingId === project.id}
                        onClick={() => void handleConfirmDelete(project.id)}
                      >
                        {deletingId === project.id ? 'Excluindo...' : 'Sim, excluir'}
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
                        Cancelar
                      </Button>
                    </span>
                  ) : (
                    <Button variant="secondary" onClick={() => setConfirmDeleteId(project.id)}>
                      Excluir
                    </Button>
                  )}
                </>
              )}

              {openFolderErrorId === project.id && (
                <p className="library-list__error">
                  Nao foi possivel abrir a pasta - ela pode ter sido movida ou apagada.
                </p>
              )}
              {repairErrorId === project.id && (
                <p className="library-list__error">
                  Nao foi possivel reparar esta gravacao. Tente novamente.
                </p>
              )}
              {renameErrorId === project.id && (
                <p className="library-list__error">
                  Nao foi possivel renomear - informe um titulo e tente novamente.
                </p>
              )}
              {deleteErrorId === project.id && (
                <p className="library-list__error">
                  Nao foi possivel excluir esta gravacao. Tente novamente.
                </p>
              )}
              {createEditErrorId === project.id && (
                <p className="library-list__error">
                  Nao foi possivel criar o projeto de edicao. Tente novamente.
                </p>
              )}

              {expandedId === project.id && (
                <div className="library-list__details">
                  {detailsLoadingId === project.id && <p>Carregando detalhes...</p>}
                  {detailsErrorId === project.id && (
                    <p className="library-list__error">Nao foi possivel carregar os detalhes.</p>
                  )}
                  {detailsLoadingId !== project.id && details && details.id === project.id && (
                    <>
                      <p>
                        Duracao:{' '}
                        {details.durationMs !== null ? formatElapsed(details.durationMs) : 'desconhecida'}
                        {' · '}
                        Tamanho total: {formatFileSize(details.totalBytes)}
                      </p>
                      {details.tracks.length === 0 ? (
                        <p>Nenhuma trilha gravada.</p>
                      ) : (
                        <ul className="library-list__tracks">
                          {details.tracks.map((track) => (
                            <li key={track.id}>
                              {TRACK_TYPE_LABELS[track.type]}: {track.segmentCount}{' '}
                              {track.segmentCount === 1 ? 'segmento' : 'segmentos'},{' '}
                              {formatFileSize(track.totalBytes)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Refinamento pos-AI-002-LOCAL - player minimo (primeiro segmento da
                          trilha principal, ver `pickPreviewSource`); se um resultado de busca
                          trouxe pra ca (`?projectId=&startMs=`), posiciona automaticamente no
                          instante assim que os metadados carregam. */}
                      {(() => {
                        const source = pickPreviewSource(details.tracks)
                        if (!source) return null
                        const src = buildMeetingMediaUrl(project.id, source.relativePath)
                        const handleLoadedMetadata = () => {
                          if (
                            deepLinkProjectId === project.id &&
                            deepLinkStartMs !== null &&
                            playerRef.current
                          ) {
                            playerRef.current.currentTime = deepLinkStartMs / 1000
                          }
                        }
                        return source.isVideo ? (
                          <video
                            ref={(el) => {
                              playerRef.current = el
                            }}
                            className="library-list__player"
                            src={src}
                            controls
                            onLoadedMetadata={handleLoadedMetadata}
                          />
                        ) : (
                          <audio
                            ref={(el) => {
                              playerRef.current = el
                            }}
                            className="library-list__player"
                            src={src}
                            controls
                            onLoadedMetadata={handleLoadedMetadata}
                          />
                        )
                      })()}
                      {/* RF-016 - `markers` so aparece depois de resolvido (null enquanto a busca
                          de `markers.list` esta em voo) - sem indicador de carregamento proprio,
                          discreto o bastante pra nao competir com o "Carregando detalhes..." de
                          cima (o mesmo clique dispara as duas buscas). */}
                      {markers && (
                        <>
                          <h4>Marcadores</h4>
                          {markers.length === 0 ? (
                            <p>Nenhum marcador nesta gravacao.</p>
                          ) : (
                            <ul className="library-list__markers">
                              {markers.map((marker) =>
                                editingMarkerId === marker.id ? (
                                  <li key={marker.id} className="library-list__marker-edit">
                                    <input
                                      aria-label="Titulo do marcador"
                                      value={markerEditTitle}
                                      onChange={(event) => setMarkerEditTitle(event.target.value)}
                                      placeholder="Titulo (opcional)"
                                    />
                                    <input
                                      aria-label="Nota do marcador"
                                      value={markerEditNote}
                                      onChange={(event) => setMarkerEditNote(event.target.value)}
                                      placeholder="Nota (opcional)"
                                    />
                                    <Button
                                      variant="secondary"
                                      disabled={markerSavingId === marker.id}
                                      onClick={() => void handleSaveMarkerEdit(marker.id)}
                                    >
                                      Salvar
                                    </Button>
                                    <Button variant="secondary" onClick={handleCancelMarkerEdit}>
                                      Cancelar
                                    </Button>
                                    {markerErrorId === marker.id && (
                                      <p className="library-list__error">Nao foi possivel salvar o marcador.</p>
                                    )}
                                  </li>
                                ) : (
                                  <li key={marker.id}>
                                    {formatElapsed(marker.timestampMs)}
                                    {marker.title && <strong> — {marker.title}</strong>}
                                    {marker.note && <span className="library-list__marker-note"> {marker.note}</span>}
                                    <Button variant="secondary" onClick={() => handleStartMarkerEdit(marker)}>
                                      Editar marcador
                                    </Button>
                                    {confirmDeleteMarkerId === marker.id ? (
                                      <span className="library-list__delete-confirm">
                                        <span>Excluir marcador?</span>
                                        <Button
                                          variant="secondary"
                                          disabled={markerDeletingId === marker.id}
                                          onClick={() => void handleDeleteMarker(marker.id)}
                                        >
                                          {markerDeletingId === marker.id ? 'Excluindo...' : 'Sim, excluir marcador'}
                                        </Button>
                                        <Button variant="secondary" onClick={() => setConfirmDeleteMarkerId(null)}>
                                          Cancelar
                                        </Button>
                                      </span>
                                    ) : (
                                      <Button variant="secondary" onClick={() => setConfirmDeleteMarkerId(marker.id)}>
                                        Excluir marcador
                                      </Button>
                                    )}
                                    {markerErrorId === marker.id && (
                                      <p className="library-list__error">Nao foi possivel excluir o marcador.</p>
                                    )}
                                  </li>
                                )
                              )}
                            </ul>
                          )}
                        </>
                      )}
                      <h4>Transcrição</h4>
                      <div className="library-list__transcription-actions">
                        <Button
                          variant="secondary"
                          onClick={() => void handleStartTranscription(project.id)}
                          disabled={
                            transcriptionBusy ||
                            (transcriptionJob?.status === 'QUEUED' || transcriptionJob?.status === 'RUNNING')
                          }
                        >
                          Transcrever
                        </Button>
                        {/* Refinamento pos-MVP - "onde encontro a transcricao?" (pedido real do
                            usuario). So aparece quando ha algo pra mostrar - um transcript
                            `COMPLETED` (o proprio `getTranscript` que decide, nao um filtro no
                            status do JOB mais recente aqui: um job `FAILED` apos um `COMPLETED`
                            anterior nao deveria esconder a transcricao ja existente). */}
                        {transcriptionJob?.status === 'COMPLETED' && (
                          <Button
                            variant="secondary"
                            onClick={() => void handleToggleTranscriptView(project.id)}
                          >
                            {transcriptOpenId === project.id ? 'Fechar transcrição' : 'Ver transcrição'}
                          </Button>
                        )}
                      </div>
                      {transcriptionError && (
                        <p className="library-list__error">{transcriptionError}</p>
                      )}
                      {transcriptionJob && (
                        <p className="library-list__transcription-status" role="status">
                          {TRANSCRIPTION_STATUS_LABELS[transcriptionJob.status]}
                          {/* WHISPER-PROGRESS - percentual granular durante RUNNING; 20-40% cobre
                              o download do modelo na primeira transcricao com um tamanho novo
                              (ver WhisperLocalProvider.transcribe), o resto e leitura/transcricao
                              em si - sem essa distincao visivel aqui, so o numero. */}
                          {transcriptionJob.status === 'RUNNING' && ` (${transcriptionJob.progress}%)`}
                          {transcriptionJob.status === 'FAILED' &&
                            transcriptionJob.error &&
                            ` - ${transcriptionJob.error}`}
                        </p>
                      )}
                      {transcriptOpenId === project.id && (
                        <div className="library-list__transcript-panel">
                          {transcriptLoading && <p className="empty-state">Carregando transcrição...</p>}
                          {transcriptViewError && (
                            <p className="library-list__error">{transcriptViewError}</p>
                          )}
                          {transcript && !transcriptLoading && (
                            <>
                              <textarea
                                className="library-list__transcript-textarea"
                                aria-label="Texto da transcrição"
                                value={transcriptEditing ? transcriptDraft : transcriptDisplayText(transcript)}
                                onChange={(event) => setTranscriptDraft(event.target.value)}
                                readOnly={!transcriptEditing}
                                disabled={transcriptSaving}
                              />
                              <div className="library-list__transcript-actions">
                                <Button variant="secondary" onClick={() => void handleCopyTranscript()}>
                                  {transcriptCopied ? 'Copiado!' : 'Copiar'}
                                </Button>
                                {transcriptEditing ? (
                                  <>
                                    <Button
                                      onClick={() => void handleSaveTranscriptEdit(project.id)}
                                      disabled={transcriptSaving}
                                    >
                                      {transcriptSaving ? 'Salvando...' : 'Salvar'}
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      onClick={handleCancelTranscriptEdit}
                                      disabled={transcriptSaving}
                                    >
                                      Cancelar
                                    </Button>
                                  </>
                                ) : (
                                  <Button variant="secondary" onClick={handleStartTranscriptEdit}>
                                    Editar
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
