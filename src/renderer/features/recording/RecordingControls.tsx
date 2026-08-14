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
  onStart: (title: string) => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onAddMarker: () => void
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
  onStart,
  onStop,
  onPause,
  onResume,
  onAddMarker
}: RecordingControlsProps) {
  const [title, setTitle] = useState('')
  const isActive = status === 'recording' || status === 'paused' || status === 'stopping'
  const isPaused = status === 'paused'

  return (
    <section className="setup-group recording-controls">
      <h2>Gravacao</h2>

      {!isActive && (
        <input
          type="text"
          className="device-select"
          aria-label="Titulo da reuniao"
          placeholder="Titulo da reuniao"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={status === 'starting'}
        />
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
              <Button variant="secondary" onClick={onAddMarker}>
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
