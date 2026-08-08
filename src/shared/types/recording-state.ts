/**
 * Maquina de estados da gravacao (04_RECORDING_ENGINE.md, 03_TECHNICAL_ARCHITECTURE.md, AGENTS.md).
 * Nesta fase apenas os TIPOS e o grafo de transicoes existem - nenhuma captura real ocorre ainda.
 *
 * Decisao registrada: `Project.status` (06_DATA_MODEL.md) reaproveita este mesmo union em vez de
 * um enum proprio, porque o status de um projeto nas fases 0-1 e inteiramente derivado da sua
 * (no maximo uma) sessao de gravacao ativa. Ver README, secao "Decisoes de arquitetura".
 */

export const RECORDING_STATES = [
  'IDLE',
  'PREPARING',
  'RECORDING',
  'PAUSED',
  'STOPPING',
  'FINALIZING',
  'COMPLETED',
  'RECOVERABLE',
  'FAILED'
] as const

export type RecordingState = (typeof RECORDING_STATES)[number]

/** Estados terminais: nenhuma transicao adicional e esperada a partir deles. */
export const TERMINAL_RECORDING_STATES: readonly RecordingState[] = ['COMPLETED', 'FAILED']

/**
 * Grafo de transicoes validas. Qualquer estado pode falhar para FAILED (falha e sempre possivel),
 * exceto a partir de estados ja terminais.
 */
export const RECORDING_TRANSITIONS: Readonly<Record<RecordingState, readonly RecordingState[]>> = {
  IDLE: ['PREPARING'],
  PREPARING: ['RECORDING', 'IDLE', 'FAILED'],
  RECORDING: ['PAUSED', 'STOPPING', 'FAILED'],
  PAUSED: ['RECORDING', 'STOPPING', 'FAILED'],
  STOPPING: ['FINALIZING', 'FAILED'],
  FINALIZING: ['COMPLETED', 'RECOVERABLE', 'FAILED'],
  RECOVERABLE: ['FINALIZING', 'FAILED'],
  COMPLETED: [],
  FAILED: []
}

export function canTransition(from: RecordingState, to: RecordingState): boolean {
  return RECORDING_TRANSITIONS[from].includes(to)
}

export function isTerminalState(state: RecordingState): boolean {
  return TERMINAL_RECORDING_STATES.includes(state)
}

/** `Project.status` (06_DATA_MODEL.md) - ver nota de decisao no topo do arquivo. */
export type ProjectStatus = RecordingState
