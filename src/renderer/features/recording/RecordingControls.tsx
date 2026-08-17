import { useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { formatElapsed } from './format-elapsed'
import { formatGb } from './format-bytes'
import type { DiskSpaceStatus } from './disk-space-thresholds'

export interface RecordingControlsProps {
  status: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping'
  elapsedMs: number
  error: string | null
  canStart: boolean
  /** RF-016 - quantidade de marcadores ja adicionados na sessao ativa. */
  markerCount: number
  /** RF-042 - `null` ate a primeira leitura do monitor de espaco em disco. */
  diskSpaceStatus: DiskSpaceStatus | null
  freeDiskBytes: number | null
  /** Refinamento pos-RF-005 - `true` quando o usuario pediu audio do sistema mas a captura falhou
   * nesta plataforma (degradacao graciosa - a gravacao continua sem essa trilha). */
  systemAudioUnavailable: boolean
  onStart: (title: string) => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  /** RF-016 - `title`/`note` vem dos dois campos opcionais abaixo, ja preenchidos pelo usuario
   * ANTES do clique (nao um modal bloqueante depois) - ver comentario no corpo do componente. */
  onAddMarker: (title?: string, note?: string) => void
}

/**
 * RF-009/RF-010/RF-016/RF-042/RF-043 - iniciar/parar/pausar/retomar/marcar gravacao + indicador
 * visual do estado (incluindo espaco em disco disponivel, 08_UX_FLOWS.md secao 4). `isActive`
 * cobre `recording`/`paused`/`stopping` - qualquer estado em que uma sessao existe e o campo de
 * titulo deve ficar escondido (so faz sentido antes de `start`).
 */
export function RecordingControls({
  status,
  elapsedMs,
  error,
  canStart,
  markerCount,
  diskSpaceStatus,
  freeDiskBytes,
  systemAudioUnavailable,
  onStart,
  onStop,
  onPause,
  onResume,
  onAddMarker
}: RecordingControlsProps) {
  const [title, setTitle] = useState('')
  // RF-016 - preenchidos ANTES de clicar em "Marcador", nao num modal depois do clique (evita
  // interromper a gravacao ao vivo com uma caixa de dialogo bloqueante) - o clique captura o
  // marcador com o que estiver digitado NAQUELE instante e limpa os dois campos, prontos pro
  // proximo marcador.
  const [markerTitle, setMarkerTitle] = useState('')
  const [markerNote, setMarkerNote] = useState('')
  const isActive = status === 'recording' || status === 'paused' || status === 'stopping'
  const isPaused = status === 'paused'

  function handleAddMarker(): void {
    onAddMarker(markerTitle.trim() || undefined, markerNote.trim() || undefined)
    setMarkerTitle('')
    setMarkerNote('')
  }

  return (
    <section className="setup-group recording-controls">
      <h2>Gravacao</h2>

      {!isActive && (
        <>
          <input
            type="text"
            className="device-select"
            aria-label="Titulo da reuniao"
            placeholder="Titulo da reuniao"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={status === 'starting'}
          />
          {/* Refinamento pos-MVP (confusao real relatada pelo usuario: "nao vi onde posso cadastrar
              novo projeto" - o app nao tem uma tela separada de "criar projeto", o projeto E a
              gravacao, criado automaticamente com este titulo ao clicar "Iniciar gravacao". Sem essa
              explicacao, o campo parecia so um rotulo opcional em vez do proprio cadastro. */}
          <p className="recording-controls__title-hint">
            Nao ha uma tela separada de "novo projeto" - ao iniciar, este titulo cria um projeto
            novo automaticamente, que fica disponivel na Biblioteca.
          </p>
        </>
      )}

      {error && <EmptyState message={error} />}

      {isActive && (
        <div className="recording-indicator" role="status">
          <span
            className={
              'recording-indicator__dot' + (isPaused ? ' recording-indicator__dot--paused' : '')
            }
            aria-hidden="true"
          />
          <span>
            {isPaused ? 'PAUSADO' : 'REC'} {formatElapsed(elapsedMs)}
          </span>
          {markerCount > 0 && (
            <span className="recording-indicator__markers">
              {markerCount} {markerCount === 1 ? 'marcador' : 'marcadores'}
            </span>
          )}
          {/* RF-042/08_UX_FLOWS.md secao 4 - "mostrar: ... espaco em disco" durante a gravacao. */}
          {freeDiskBytes !== null && (
            <span className="recording-indicator__disk-space">{formatGb(freeDiskBytes)} livres</span>
          )}
        </div>
      )}

      {/* RF-042 - aviso discreto (nao bloqueia a gravacao) quando o espaco livre cruza o limiar de
          aviso configurado. O nivel critico nao precisa de um banner proprio - dispara um stop
          automatico quase imediato, cujo motivo aparece via `error` (ver `useRecordingSession.ts`). */}
      {isActive && diskSpaceStatus === 'warning' && (
        <p className="disk-space-warning" role="alert">
          Aviso: espaco em disco baixo. Libere espaco para evitar que a gravacao seja interrompida.
        </p>
      )}

      {/* Refinamento pos-RF-005 - audio do sistema foi PEDIDO (checkbox marcado em
          RecordingSetupPage) mas a captura falhou nesta plataforma; a gravacao das demais fontes
          segue normalmente, mas antes disso o usuario nao tinha nenhuma forma de saber que essa
          trilha especifica ficou de fora. */}
      {isActive && systemAudioUnavailable && (
        <p className="disk-space-warning" role="alert">
          Audio do sistema nao esta disponivel nesta plataforma - a gravacao continua sem essa
          trilha.
        </p>
      )}

      {/* RF-016 - so durante gravacao ativa (nao pausada, mesmo guard do botao "Marcador" logo
          abaixo): titulo/nota digitados AQUI valem pro PROXIMO clique em "Marcador", nao pro
          marcador mais recente ja criado (nenhum "editar depois" nesta tela - so na Biblioteca). */}
      {status === 'recording' && (
        <div className="recording-controls__marker-fields">
          <input
            type="text"
            className="device-select"
            aria-label="Titulo do marcador"
            placeholder="Titulo do marcador (opcional)"
            value={markerTitle}
            onChange={(event) => setMarkerTitle(event.target.value)}
            maxLength={200}
          />
          <input
            type="text"
            className="device-select"
            aria-label="Nota do marcador"
            placeholder="Nota do marcador (opcional)"
            value={markerNote}
            onChange={(event) => setMarkerNote(event.target.value)}
            maxLength={2000}
          />
        </div>
      )}

      <div className="recording-controls__actions">
        {!isActive ? (
          <Button
            onClick={() => onStart(title.trim() || 'Reuniao sem titulo')}
            disabled={!canStart || status === 'starting'}
          >
            {status === 'starting' ? 'Iniciando...' : 'Iniciar gravacao'}
          </Button>
        ) : (
          <>
            {(status === 'recording' || status === 'paused') && (
              <Button
                variant="secondary"
                onClick={isPaused ? onResume : onPause}
              >
                {isPaused ? 'Retomar' : 'Pausar'}
              </Button>
            )}
            {/* RF-016 - so durante gravacao ativa (nao pausada, ver comentario em
                `AddMarkerRequestSchema`): enquanto pausado nao ha "instante atual" pra marcar. */}
            {status === 'recording' && (
              <Button variant="secondary" onClick={handleAddMarker}>
                Marcador
              </Button>
            )}
            <Button variant="secondary" onClick={onStop} disabled={status === 'stopping'}>
              {status === 'stopping' ? 'Finalizando...' : 'Parar'}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
