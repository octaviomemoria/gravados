import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { ExportJobResponse } from '@shared/schemas/export.schema'

const EXPORT_STATUS_LABELS: Record<ExportJobResponse['status'], string> = {
  QUEUED: 'Na fila',
  RUNNING: 'Exportando',
  COMPLETED: 'Concluida',
  FAILED: 'Falhou',
  CANCELED: 'Cancelada'
}

/**
 * RF-035: acompanhar exportacoes. EXP-001/002 entregou so a leitura real (`export.list`, ate
 * entao sempre vazia). EXP-003/004 - agora que `export.start` (disparado a partir do editor)
 * efetivamente cria jobs, esta pagina reconsulta `export.list` a cada 1.5s enquanto estiver aberta
 * (mesmo espirito do polling de progresso ja usado no editor para um unico job) - simples e
 * suficiente pra uma lista pequena, sem precisar rastrear "algum job ainda em andamento" aqui (o
 * proprio `export.list` e barato, so uma leitura da tabela `export_jobs`).
 */
export function ExportsPage() {
  const [jobs, setJobs] = useState<ExportJobResponse[] | null>(null)

  useEffect(() => {
    let cancelled = false
    function fetchJobs(): void {
      window.meetingStudio.export
        .list()
        .then((result) => {
          if (!cancelled) setJobs(result)
        })
        .catch(() => {
          if (!cancelled) setJobs([])
        })
    }
    fetchJobs()
    const intervalId = window.setInterval(fetchJobs, 1500)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
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
              {job.id} - {EXPORT_STATUS_LABELS[job.status]}
              {(job.status === 'QUEUED' || job.status === 'RUNNING') && ` (${job.progress}%)`}
              {job.status === 'FAILED' && job.error && ` - ${job.error}`}
              {job.status === 'COMPLETED' && job.outputPath && ` - ${job.outputPath}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
