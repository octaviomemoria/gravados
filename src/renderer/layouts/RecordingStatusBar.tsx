import { useLocation } from 'react-router-dom'
import { useRecordingSessionContext } from '../features/recording/recording-session-context'
import { formatElapsed } from '../features/recording/format-elapsed'
import { Button } from '../components/Button'

/**
 * Refinamento pos-MVP (bug relatado pelo usuario testando o app - ver comentario completo em
 * `RecordingSessionProvider.tsx`). Barra fixa, montada no `AppShell` (nunca desmonta com a
 * navegacao), visivel em QUALQUER tela enquanto houver uma sessao de gravacao ativa - o usuario
 * pode navegar livremente pra Biblioteca/Configuracoes/etc. sem perder a gravacao em andamento, e
 * ainda consegue pausar/retomar/parar de la.
 *
 * Escondida na propria tela "/recording" - `RecordingControls` ja mostra os mesmos controles (com
 * mais detalhe: espaco em disco, marcadores, campos de titulo/nota) diretamente naquela tela, uma
 * segunda barra ali seria so ruido duplicado.
 */
export function RecordingStatusBar() {
  const { pathname } = useLocation()
  const { recordingSession } = useRecordingSessionContext()
  const { status, elapsedMs, error } = recordingSession

  const isActive = status === 'recording' || status === 'paused' || status === 'stopping'
  if (!isActive || pathname === '/recording') return null

  const isPaused = status === 'paused'

  return (
    <div className="recording-status-bar" role="status">
      <span
        className={
          'recording-indicator__dot' + (isPaused ? ' recording-indicator__dot--paused' : '')
        }
        aria-hidden="true"
      />
      <span className="recording-status-bar__label">
        {isPaused ? 'PAUSADO' : 'REC'} {formatElapsed(elapsedMs)}
      </span>
      {error && <span className="recording-status-bar__error">{error}</span>}
      <div className="recording-status-bar__actions">
        {(status === 'recording' || status === 'paused') && (
          <Button
            variant="secondary"
            onClick={() => void (isPaused ? recordingSession.resume() : recordingSession.pause())}
          >
            {isPaused ? 'Retomar' : 'Pausar'}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => void recordingSession.stop()}
          disabled={status === 'stopping'}
        >
          {status === 'stopping' ? 'Finalizando...' : 'Parar'}
        </Button>
      </div>
    </div>
  )
}
