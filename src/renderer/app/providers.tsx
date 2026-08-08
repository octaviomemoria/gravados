import { useEffect, type ReactNode } from 'react'
import { useThemeStore, resolveEffectiveTheme, type ThemePreference } from './stores/theme.store'

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function AppProviders({ children }: { children: ReactNode }) {
  const preference = useThemeStore((state) => state.preference)
  const hydrate = useThemeStore((state) => state.hydrate)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.settings
      .get('app')
      .then((settings) => {
        if (cancelled) return
        hydrate(isThemePreference(settings.theme) ? settings.theme : 'system')
      })
      .catch(() => {
        if (!cancelled) hydrate('system')
      })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = (): void => {
      document.documentElement.dataset.theme = resolveEffectiveTheme(preference, media.matches)
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [preference])

  return children
}
