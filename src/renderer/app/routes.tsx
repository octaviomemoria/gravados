import { Routes, Route } from 'react-router-dom'
import { HomePage } from './HomePage'
import { RecordingSetupPage } from '../features/recording/RecordingSetupPage'
import { LibraryPage } from '../features/library/LibraryPage'
import { EditorListPage } from '../features/editor/EditorListPage'
import { EditorProjectPage } from '../features/editor/EditorProjectPage'
import { ExportsPage } from '../features/exports/ExportsPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/recording" element={<RecordingSetupPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/editor" element={<EditorListPage />} />
      <Route path="/editor/:id" element={<EditorProjectPage />} />
      <Route path="/exports" element={<ExportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}
