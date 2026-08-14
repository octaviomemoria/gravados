import { formatElapsed } from '../recording/format-elapsed'
import { TRACK_TYPE_LABELS } from '../library/track-type-labels'
import type { GetTimelineResponse } from '@shared/schemas/editor.schema'

/**
 * EDIT-002 (decimo terceiro incremento - Fase 3, Editor MVP). Visualizacao SOMENTE-LEITURA da
 * timeline compilada - cada bloco e um clip 1:1 com um segmento gravado (nenhuma operacao de
 * edicao ainda existe). Sem playhead/scrubber/preview de video ainda (EDIT-003), sem
 * arrastar/cortar/dividir ainda (EDIT-004/005) - so a estrutura da gravacao no tempo, a base
 * visual sobre a qual os proximos incrementos constroem interatividade.
 *
 * Posicionamento por porcentagem (`left`/`width` relativos a `totalDurationMs`), nao por pixel
 * fixo - responsivo a largura do container sem nenhum recalculo em JS ao redimensionar a janela.
 */
export function Timeline({ timeline }: { timeline: GetTimelineResponse }) {
  if (timeline.tracks.length === 0) {
    return <p className="timeline__empty">Nenhuma trilha gravada para mostrar na timeline.</p>
  }

  // Nunca dividir por zero - `totalDurationMs` so seria 0 se todo clip tivesse duracao zero
  // (nao deveria acontecer com dados reais, mas o calculo de porcentagem precisa ser seguro).
  const totalMs = Math.max(timeline.totalDurationMs, 1)
  const rulerMarks = buildRulerMarks(totalMs)

  return (
    <div className="timeline">
      <div className="timeline__ruler">
        {rulerMarks.map((markMs) => (
          <span
            key={markMs}
            className="timeline__ruler-mark"
            style={{ left: `${(markMs / totalMs) * 100}%` }}
          >
            {formatElapsed(markMs)}
          </span>
        ))}
      </div>
      {timeline.tracks.map((track) => (
        <div key={track.id} className="timeline__track">
          <span className="timeline__track-label">{TRACK_TYPE_LABELS[track.type]}</span>
          <div className="timeline__track-lane">
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
