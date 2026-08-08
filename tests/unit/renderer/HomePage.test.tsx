// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from '../../../src/renderer/app/HomePage'

describe('HomePage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'meetingStudio', {
      configurable: true,
      value: {
        system: {
          getDiskSpace: vi.fn().mockResolvedValue({
            freeBytes: 10 * 1024 ** 3,
            totalBytes: 100 * 1024 ** 3,
            path: '/x'
          })
        }
      }
    })
  })

  it('renders the app name, tagline and the "Nova gravacao" CTA', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Meeting Studio' })).toBeInTheDocument()
    expect(screen.getByText('Central inteligente de reunioes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nova gravacao' })).toBeInTheDocument()
  })

  it('renders the three mocked cards with the documented friendly empty-state copy', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )

    expect(screen.getByText('Gravacoes recentes')).toBeInTheDocument()
    expect(screen.getByText('Projetos de edicao')).toBeInTheDocument()
    expect(screen.getByText('Exportacoes')).toBeInTheDocument()
    expect(
      screen.getByText('Nenhuma gravacao ainda. Crie sua primeira reuniao para comecar.')
    ).toBeInTheDocument()
  })
})
