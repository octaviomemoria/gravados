import { useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { formatElapsed } from './format-elapsed'

export interface RecordingControlsProps {
  status: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping'
  elapsedMs: number
  error: string | null
  canStart: boolean
  /** RF-016 - quantidade de marcadores ja adicionados na sessao ativa. */
  markerCount: number
  onStart: (title: string) => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onAddMarker: () => void
}

/**
 * RF-009/RF-010/RF-016/RF-043 - iniciar/parar/pausar/retomar/marcar gravacao + indicador visual
 * do estado. `isActive` cobre `recording`/`paused`/`stopping` - qualquer estado em que uma sessao
 * existe e o campo de titulo deve ficar escondido (so faz sentido antes de `start`).
 */
export function RecordingControls({
  status,
  elapsedMs,
  error,
  canStart,
  markerCount,
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
