// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useThemeStore, resolveEffectiveTheme } from '../../../src/renderer/app/stores/theme.store'

describe('resolveEffectiveTheme', () => {
  it('resolves the system preference using the OS color scheme', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark')
    expect(resolveEffectiveTheme('system', false)).toBe('light')
  })

  it('resolves explicit preferences directly, ignoring the OS color scheme', () => {
    expect(resolveEffectiveTheme('light', true)).toBe('light')
    expect(resolveEffectiveTheme('dark', false)).toBe('dark')
  })
})

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: 'system', hydrated: false })
    Object.defineProperty(window, 'meetingStudio', {
      configurable: true,
      value: {
        settings: {
          get: vi.fn().mockResolvedValue({ theme: 'system', defaultLibraryRootPath: '/x' }),
          update: vi.fn().mockResolvedValue({})
        }
      }
    })
  })

  it('updates the preference immediately (optimistic local update)', () => {
    useThemeStore.getState().setPreference('dark')
    expect(useThemeStore.getState().preference).toBe('dark')
  })

  it('hydrate marks the store as hydrated', () => {
    useThemeStore.getState().hydrate('dark')
    expect(useThemeStore.getState()).toMatchObject({ preference: 'dark', hydrated: true })
  })

  it('persists the change through window.meetingStudio.settings.update (settings.app)', async () => {
    useThemeStore.getState().setPreference('dark')

    await vi.waitFor(() => {
      expect(window.meetingStudio.settings.update).toHaveBeenCalledWith(
        'app',
        expect.objectContaining({ theme: 'dark' })
      )
    })
  })
})
