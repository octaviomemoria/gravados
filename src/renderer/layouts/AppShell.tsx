import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { RecordingStatusBar } from './RecordingStatusBar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-shell__content">
        <RecordingStatusBar />
        {children}
      </main>
    </div>
  )
}
