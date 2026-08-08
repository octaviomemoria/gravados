import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { ExportJobResponse } from '@shared/schemas/export.schema'

/** RF-035: acompanhar exportacoes. Consulta real via IPC (`export.list`) - hoje sempre vazia. */
export function ExportsPage() {
  const [jobs, setJobs] = useState<ExportJobResponse[] | null>(null)

  useEffect(() => {
    let cancelled = false
    window.meetingStudio.export
      .list()
      .then((result) => {
        if (!cancelled) setJobs(result)
      })
      .catch(() => {
        if (!cancelled) setJobs([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="feature-page">
      <h1>Exportacoes</h1>
      {jobs && jobs.length === 0 && <EmptyState message="Nenhuma exportacao ainda." />}
      {jobs && jobs.length > 0 && (
        <ul className="export-list">
          {jobs.map((job) => (
            <li key={job.id}>
              {job.id} - {job.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
