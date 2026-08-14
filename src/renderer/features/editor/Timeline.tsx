import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import { formatElapsed } from '../recording/format-elapsed'
import { TRACK_TYPE_LABELS } from '../library/track-type-labels'
import { msFromPointerOffset } from './timeline-playback'
import type { GetTimelineResponse } from '@shared/schemas/editor.schema'

/**
 * EDIT-002/EDIT-003 parte 2/EDIT-004-005-006 (Fase 3, Editor MVP). Visualizacao da timeline
 * compilada. Mostra um PLAYHEAD sincronizado com o player (`currentTimeMs`), aceita clique/arrasto
 * na regua ou em qualquer lane de trilha para buscar (`onSeek`), e desde EDIT-004/005/006 pode
 * destacar uma SELECAO de intervalo (`selection`) usada para cortar/remover um trecho.
 *
 * Posicionamento por porcentagem (`left`/`width` relativos a `totalDurationMs`), nao por pixel
 * fixo - responsivo a largura do container sem nenhum recalculo em JS ao redimensionar a janela.
 * O playhead e desenhado DENTRO de cada lane de trilha (mesma referencia de largura que os
 * proprios clips daquela lane) em vez de uma unica linha absoluta sobre o componente inteiro -
 * a regua tem uma largura diferente das lanes (nao reserva a coluna do rotulo da trilha), entao
 * uma unica linha "global" ficaria desalinhada com os clips; desenhar por lane usa sempre a
 * largura certa sem precisar medir nada em JS.
 */
export function Timeline({
  timeline,
  currentTimeMs,
  onSeek,
  selection
}: {
  timeline: GetTimelineResponse
  currentTimeMs?: number
  onSeek?: (ms: number) => void
  /** EDIT-004/005/006 - intervalo destacado (chave para remover/cortar), se houver. */
  selection?: { startMs: number; endMs: number } | null
}) {
  const totalMs = Math.max(timeline.totalDurationMs, 1)
  const rulerMarks = buildRulerMarks(totalMs)

  const handleSeek = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!onSeek) return
      const rect = event.currentTarget.getBoundingClientRect()
      onSeek(msFromPointerOffset(event.clientX - rect.left, rect.width, totalMs))
    },
    [onSeek, totalMs]
  )

  if (timeline.tracks.length === 0) {
    return <p className="timeline__empty">Nenhuma trilha gravada para mostrar na timeline.</p>
  }

  const playheadPct =
    currentTimeMs !== undefined ? `${Math.min((currentTimeMs / totalMs) * 100, 100)}%` : null
  const selectionStyle = selection
    ? {
        left: `${(selection.startMs / totalMs) * 100}%`,
        width: `${Math.max(((selection.endMs - selection.startMs) / totalMs) * 100, 0.5)}%`
      }
    : null

  return (
    <div className="timeline">
      <div
        className={`timeline__ruler${onSeek ? ' timeline__ruler--seekable' : ''}`}
        onClick={onSeek ? handleSeek : undefined}
      >
        {rulerMarks.map((markMs) => (
          <span
            key={markMs}
            className="timeline__ruler-mark"
            style={{ left: `${(markMs / totalMs) * 100}%` }}
          >
            {formatElapsed(markMs)}
          </span>
        ))}
        {selectionStyle && <div className="timeline__selection" style={selectionStyle} />}
        {playheadPct !== null && (
          <div className="timeline__playhead" style={{ left: playheadPct }} />
        )}
      </div>
      {timeline.tracks.map((track) => (
        <div key={track.id} className="timeline__track">
          <span className="timeline__track-label">{TRACK_TYPE_LABELS[track.type]}</span>
          <div
            className={`timeline__track-lane${onSeek ? ' timeline__track-lane--seekable' : ''}`}
            onClick={onSeek ? handleSeek : undefined}
          >
            {track.clips.map((clip) => (
              <div
                // `segmentId` sozinho nao e mais unico dentro de uma trilha desde EDIT-004/005/006
                // - um REMOVE_RANGE que corta o MEIO de um clip o divide em dois, ambos referenciando
                // o mesmo segmento de origem. `startMs` e garantido unico entre clips da mesma
                // trilha (nao se sobrepoem por construcao).
                key={`${clip.segmentId}-${clip.startMs}`}
                className="timeline__clip"
                style={{
                  left: `${(clip.startMs / totalMs) * 100}%`,
                  width: `${Math.max(((clip.endMs - clip.startMs) / totalMs) * 100, 0.5)}%`
                }}
                title={`Segmento ${clip.seqIndex} · ${formatElapsed(clip.startMs)} - ${formatElapsed(clip.endMs)}`}
              />
            ))}
            {selectionStyle && <div className="timeline__selection" style={selectionStyle} />}
            {playheadPct !== null && (
              <div className="timeline__playhead" style={{ left: playheadPct }} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Ate 6 marcacoes na regua, em intervalos "redondos" (1/2/5/10/30/60s, etc.) - nunca um numero
 * arbitrario de casas decimais de milissegundo que ninguem consegue ler de relance. */
function buildRulerMarks(totalMs: number): number[] {
  const targetMarks = 6
  const rawStepMs = totalMs / targetMarks
  const niceStepsMs = [1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000]
  const stepMs = niceStepsMs.find((step) => step >= rawStepMs) ?? niceStepsMs[niceStepsMs.length - 1]!

  const marks: number[] = []
  for (let markMs = 0; markMs < totalMs; markMs += stepMs) {
    marks.push(markMs)
  }
  return marks
}
