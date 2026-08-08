import { Routes, Route } from 'react-router-dom'
import { HomePage } from './HomePage'
import { RecordingHomeStub } from '../features/recording/RecordingHomeStub'
import { LibraryPage } from '../features/library/LibraryPage'
import { EditorPlaceholderPage } from '../features/editor/EditorPlaceholderPage'
import { ExportsPage } from '../features/exports/ExportsPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/recording" element={<RecordingHomeStub />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/editor" element={<EditorPlaceholderPage />} />
      <Route path="/exports" element={<ExportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}
