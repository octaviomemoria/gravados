import { useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { formatElapsed } from './format-elapsed'

export interface RecordingControlsProps {
  status: 'idle' | 'starting' | 'recording' | 'stopping'
  elapsedMs: number
  error: string | null
  micSelected: boolean
  onStart: (title: string) => void
  onStop: () => void
}

/** RF-009/RF-043 - iniciar/parar gravacao + indicador visual de que uma sessao esta ativa. */
export function RecordingControls({
  status,
  elapsedMs,
  error,
  micSelected,
  onStart,
  onStop
}: RecordingControlsProps) {
  const [title, setTitle] = useState('')
  const isActive = status === 'recording' || status === 'stopping'

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
          <span className="recording-indicator__dot" aria-hidden="true" />
          <span>REC {formatElapsed(elapsedMs)}</span>
        </div>
      )}

      <div className="recording-controls__actions">
        {!isActive ? (
          <Button
            onClick={() => onStart(title.trim() || 'Reuniao sem titulo')}
            disabled={!micSelected || status === 'starting'}
          >
            {status === 'starting' ? 'Iniciando...' : 'Iniciar gravacao'}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onStop} disabled={status === 'stopping'}>
            {status === 'stopping' ? 'Finalizando...' : 'Parar'}
          </Button>
        )}
      </div>
    </section>
  )
}
