import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import { formatElapsed } from '../recording/format-elapsed'
import { TRACK_TYPE_LABELS } from '../library/track-type-labels'
import { msFromPointerOffset } from './timeline-playback'
import type { GetTimelineResponse } from '@shared/schemas/editor.schema'

/**
 * EDIT-002/EDIT-003 parte 2 (Fase 3, Editor MVP). Visualizacao da timeline compilada - cada bloco
 * e um clip 1:1 com um segmento gravado (nenhuma operacao de edicao ainda existe). Desde
 * EDIT-003 parte 2, mostra um PLAYHEAD sincronizado com o player (`currentTimeMs`) e aceita
 * clique/arrasto na regua ou em qualquer lane de trilha para buscar (`onSeek`) - sem
 * arrastar/cortar CLIPS ainda (EDIT-004/005), so navegacao no tempo.
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
  onSeek
}: {
  timeline: GetTimelineResponse
  currentTimeMs?: number
  onSeek?: (ms: number) => void
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
                key={clip.segmentId}
                className="timeline__clip"
                style={{
                  left: `${(clip.startMs / totalMs) * 100}%`,
                  width: `${Math.max(((clip.endMs - clip.startMs) / totalMs) * 100, 0.5)}%`
                }}
                title={`Segmento ${clip.seqIndex} · ${formatElapsed(clip.startMs)} - ${formatElapsed(clip.endMs)}`}
              />
            ))}
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
