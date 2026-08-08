import { canTransition, type RecordingState } from '../../shared/types/recording-state'

export class InvalidRecordingTransitionError extends Error {
  constructor(from: RecordingState, to: RecordingState) {
    super(`Transicao de gravacao invalida: ${from} -> ${to}`)
    this.name = 'InvalidRecordingTransitionError'
  }
}

/**
 * Guarda o estado de UMA sessao de gravacao no processo main e aplica o grafo de transicoes de
 * `shared/types/recording-state.ts`. Nesta fase nenhum dispositivo/FFmpeg real e acionado - a
 * Fase 1 (Recording Core) conecta chamadas reais aqui sem alterar o grafo de estados.
 */
export class RecordingStateMachine {
  private state: RecordingState = 'IDLE'

  getState(): RecordingState {
    return this.state
  }

  transitionTo(next: RecordingState): RecordingState {
    if (!canTransition(this.state, next)) {
      throw new InvalidRecordingTransitionError(this.state, next)
    }
    this.state = next
    return this.state
  }

  reset(): void {
    this.state = 'IDLE'
  }
}
