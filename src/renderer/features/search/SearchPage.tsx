import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import type { SearchHitResponse } from '@shared/schemas/search.schema'

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * SEARCH-001 (Fase 7 — Knowledge). Busca full-text 100% local sobre transcricoes ja concluidas
 * (via `search.transcripts`, FTS5). Sem debounce/polling - dispara so no submit do formulario
 * (mesmo espirito de qualquer outra tela deste app: um clique, uma chamada, um resultado), ja que
 * FTS5 e rapido o bastante pra nao precisar de busca-enquanto-digita. Ate AI-002 (integracao real
 * de transcricao) estar implementada, todo resultado sera sempre vazio - um estado normal, nao um
 * bug, refletido no texto do `EmptyState`.
 */
export function SearchPage() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHitResponse[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      setHits(null)
      setError(null)
      return
    }
    setSearching(true)
    setError(null)
    window.meetingStudio.search
      .transcripts(trimmed)
      .then((result) => setHits(result))
      .catch(() => setError('Nao foi possivel completar a busca.'))
      .finally(() => setSearching(false))
  }

  return (
    <div className="feature-page">
      <h1>Busca</h1>
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          type="search"
          className="search-form__input"
          placeholder="Buscar em transcricoes..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={searching || query.trim().length === 0}>
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </form>
      {error && <p className="search-results__error">{error}</p>}
      {hits && hits.length === 0 && !error && (
        <EmptyState message="Nenhum resultado. Busca funciona sobre transcricoes ja concluidas - se nenhuma reuniao foi transcrita ainda, nao ha nada pra encontrar." />
      )}
      {hits && hits.length > 0 && (
        <ul className="search-results">
          {hits.map((hit) => (
            <li key={hit.segmentId}>
              <div className="search-results__meta">
                <Link to={`/library`}>{hit.projectTitle}</Link>
                <span> - {formatTimestamp(hit.startMs)}</span>
                {hit.speaker && <span> - {hit.speaker}</span>}
              </div>
              <p className="search-results__text">{hit.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
