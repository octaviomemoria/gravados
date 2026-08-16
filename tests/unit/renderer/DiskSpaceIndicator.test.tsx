// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DiskSpaceIndicator } from '../../../src/renderer/components/DiskSpaceIndicator'

/**
 * Refinamento pos-RF-042 (resolve a pendencia "sem indicador visual explicito de espaco OK").
 * `classifyDiskSpace` ja tem cobertura direta e exaustiva em `disk-space-thresholds.test.ts` -
 * aqui so confirma que o COMPONENTE liga os dois IPCs (`system.getDiskSpace` +
 * `settings.get('recordingPresets')`) e renderiza o selo certo pra cada faixa, mais o caso
 * defensivo de `settings` ausente (mesmo mock parcial usado em `HomePage.test.tsx`).
 */
function mockMeetingStudio(overrides: {
  freeBytes: number
  totalBytes?: number
  thresholds?: { diskSpaceWarningThresholdMb: number; diskSpaceCriticalThresholdMb: number }
}): void {
  Object.defineProperty(window, 'meetingStudio', {
    configurable: true,
    value: {
      system: {
        getDiskSpace: vi.fn().mockResolvedValue({
          freeBytes: overrides.freeBytes,
          totalBytes: overrides.totalBytes ?? 100 * 1024 ** 3,
          path: '/x'
        })
      },
      ...(overrides.thresholds
        ? {
            settings: {
              get: vi.fn().mockResolvedValue({
                // Campos obrigatorios de RecordingPresetsSettingsSchema alem dos dois limiares -
                // irrelevantes pro que este teste verifica, mas precisam existir pro safeParse
                // no componente nao rejeitar o objeto inteiro.
                qualityPreset: 'STANDARD',
                timeSegmentationMinutes: null,
                sizeSegmentationMb: null,
                ...overrides.thresholds
              })
            }
          }
        : {})
    }
  })
}

describe('DiskSpaceIndicator', () => {
  it('shows "Espaco OK" when free space is comfortably above the warning threshold', async () => {
    mockMeetingStudio({
      freeBytes: 50 * 1024 ** 3,
      thresholds: { diskSpaceWarningThresholdMb: 2000, diskSpaceCriticalThresholdMb: 500 }
    })
    render(<DiskSpaceIndicator />)
    await waitFor(() => expect(screen.getByText('Espaco OK')).toBeInTheDocument())
  })

  it('shows "Espaco baixo" between the warning and critical thresholds', async () => {
    mockMeetingStudio({
      freeBytes: 1000 * 1024 ** 2, // 1000MB - abaixo do warning (2000MB), acima do critical (500MB)
      thresholds: { diskSpaceWarningThresholdMb: 2000, diskSpaceCriticalThresholdMb: 500 }
    })
    render(<DiskSpaceIndicator />)
    await waitFor(() => expect(screen.getByText('Espaco baixo')).toBeInTheDocument())
  })

  it('shows "Espaco critico" below the critical threshold', async () => {
    mockMeetingStudio({
      freeBytes: 100 * 1024 ** 2, // 100MB - abaixo do critical (500MB)
      thresholds: { diskSpaceWarningThresholdMb: 2000, diskSpaceCriticalThresholdMb: 500 }
    })
    render(<DiskSpaceIndicator />)
    await waitFor(() => expect(screen.getByText('Espaco critico')).toBeInTheDocument())
  })

  it('renders the free/total GB text without a badge when settings.get is unavailable (defensive)', async () => {
    mockMeetingStudio({ freeBytes: 10 * 1024 ** 3 }) // sem `recordingPresets` - mock parcial, sem `settings`
    render(<DiskSpaceIndicator />)
    await waitFor(() => expect(screen.getByText(/livres de/)).toBeInTheDocument())
    expect(screen.queryByText('Espaco OK')).not.toBeInTheDocument()
    expect(screen.queryByText('Espaco baixo')).not.toBeInTheDocument()
    expect(screen.queryByText('Espaco critico')).not.toBeInTheDocument()
  })
})
