import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import type { ProjectResponse } from '@shared/schemas/project.schema'

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

/** RF-017: lista de reunioes. Consulta real via IPC (`library.list`, alias de `project.list`). */
export function LibraryPage() {
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

  // Sem guarda de "cancelado" (diferente do `useEffect` de montagem abaixo) - reusada so apos uma
  // acao explicita do usuario (reparo) enquanto a pagina ja esta montada, nunca numa corrida com
  // desmontagem.
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
              <span className="library-list__title">
                {project.title}
                {isRecoverable(project.status) && (
                  <span className="library-list__badge" role="status">
                    Incompleta
                  </span>
                )}
              </span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
