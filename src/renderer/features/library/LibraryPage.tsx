import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import { formatFileSize } from './format-file-size'
import { formatElapsed } from '../recording/format-elapsed'
import type { ProjectResponse, ProjectDetailsResponse } from '@shared/schemas/project.schema'
import type { TrackType } from '@shared/types/entities'

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

const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  SCREEN: 'Tela',
  CAMERA: 'Câmera',
  MICROPHONE: 'Microfone',
  SYSTEM_AUDIO: 'Áudio do sistema'
}

/** RF-017: lista de reunioes. Consulta real via IPC (`library.list`, alias de `project.list`). */
export function LibraryPage() {
  const navigate = useNavigate()
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

  // LIB-004: edicao inline do titulo.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
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
    setDetailsLoadingId(projectId)
    try {
      const result = await window.meetingStudio.library.getDetails(projectId)
      setDetails(result)
    } catch {
      setDetailsErrorId(projectId)
    } finally {
      setDetailsLoadingId(null)
    }
  }

  function handleStartRename(project: ProjectResponse): void {
    setRenameErrorId(null)
    setRenamingId(project.id)
    setRenameDraft(project.title)
  }

  function handleCancelRename(): void {
    setRenamingId(null)
    setRenameDraft('')
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
      await window.meetingStudio.project.rename(projectId, title)
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
