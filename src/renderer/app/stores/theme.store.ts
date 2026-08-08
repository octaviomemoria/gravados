import { create } from 'zustand'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeState {
  preference: ThemePreference
  hydrated: boolean
  setPreference: (preference: ThemePreference) => void
  hydrate: (preference: ThemePreference) => void
}

/**
 * Store Zustand dedicada ao dominio de tema (12_DEVELOPMENT_STANDARDS.md/prompt: "Estruture
 * stores por dominio", evitar uma unica store gigantesca). A preferencia e persistida via IPC na
 * categoria `settings.app` (SQLite) - fonte de verdade e o backend, nao localStorage.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  hydrated: false,
  setPreference: (preference) => {
    set({ preference })
    void persistThemePreference(preference)
  },
  hydrate: (preference) => set({ preference, hydrated: true })
}))

export function resolveEffectiveTheme(
  preference: ThemePreference,
  prefersDark: boolean
): 'light' | 'dark' {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference
}

async function persistThemePreference(preference: ThemePreference): Promise<void> {
  try {
    const current = await window.meetingStudio.settings.get('app')
    await window.meetingStudio.settings.update('app', { ...current, theme: preference })
  } catch {
    // Falha ao persistir a preferencia de tema nao deve quebrar a troca visual local.
  }
}
