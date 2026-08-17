// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecordingControls, type RecordingControlsProps } from '../../../src/renderer/features/recording/RecordingControls'

/**
 * Refinamento pos-MVP (confusao real relatada pelo usuario testando o app: "nao vi onde posso
 * cadastrar novo projeto" na tela de Nova gravacao). O app nao tem uma tela separada de "criar
 * projeto" - o titulo digitado aqui cria o projeto automaticamente ao iniciar. Este teste garante
 * que a dica explicando isso aparece ANTES de iniciar e some assim que a gravacao fica ativa (o
 * campo de titulo tambem some nesse momento - nao faria sentido continuar explicando um campo que
 * nao esta mais visivel).
 */
function baseProps(overrides: Partial<RecordingControlsProps> = {}): RecordingControlsProps {
  return {
    status: 'idle',
    elapsedMs: 0,
    error: null,
    canStart: true,
    markerCount: 0,
    diskSpaceStatus: null,
    freeDiskBytes: null,
    systemAudioUnavailable: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onAddMarker: vi.fn(),
    ...overrides
  }
}

describe('RecordingControls', () => {
  it('shows a hint explaining that starting the recording creates the project automatically', () => {
    render(<RecordingControls {...baseProps({ status: 'idle' })} />)
    expect(
      screen.getByText(/nao ha uma tela separada de "novo projeto"/i)
    ).toBeInTheDocument()
  })

  it('hides the hint (and the title field) once a recording is active', () => {
    render(<RecordingControls {...baseProps({ status: 'recording' })} />)
    expect(
      screen.queryByText(/nao ha uma tela separada de "novo projeto"/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Titulo da reuniao')).not.toBeInTheDocument()
  })
})
