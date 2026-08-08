import { useEffect, useState } from 'react'
import type { ScreenSource } from '@shared/schemas/devices.schema'

export interface ScreenSourcesState {
  sources: ScreenSource[] | null
  error: boolean
}

/** RF-002 - fontes de tela/janela disponiveis, via IPC (`devices.listScreens`). */
export function useScreenSources(): ScreenSourcesState {
  const [sources, setSources] = useState<ScreenSource[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.devices
      .listScreens()
      .then((result) => {
        if (!cancelled) setSources(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { sources, error }
}
