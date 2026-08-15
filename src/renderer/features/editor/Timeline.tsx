import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import { formatElapsed } from '../recording/format-elapsed'
import { TRACK_TYPE_LABELS } from '../library/track-type-labels'
import { msFromPointerOffset } from './timeline-playback'
import type { GetTimelineResponse, CameraTransform } from '@shared/schemas/editor.schema'

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
  selection,
  onSetTrackGain,
  onSetTrackFade,
  onSetTrackCameraTransform
}: {
  timeline: GetTimelineResponse
  currentTimeMs?: number
  onSeek?: (ms: number) => void
  /** EDIT-004/005/006 - intervalo destacado (chave para remover/cortar), se houver. */
  selection?: { startMs: number; endMs: number } | null
  /** EDIT-008 - controles de mudo/ganho por trilha, mostrados na coluna de rotulo quando
   * fornecido (omitido = so o rotulo, sem controles - ex.: um preview futuro somente-leitura que
   * reuse este componente sem edicao). */
  onSetTrackGain?: (trackId: string, gainDb: number, muted: boolean) => void
  /** EDIT-009 - duracao (ms) de fade-in/fade-out por trilha, mesmo padrao de prop opcional de
   * `onSetTrackGain`. */
  onSetTrackFade?: (trackId: string, fadeInMs: number, fadeOutMs: number) => void
  /** EDIT-010 - visibilidade/posicao/tamanho/forma (PiP) da trilha CAMERA, mesmo padrao opcional
   * de `onSetTrackGain`/`onSetTrackFade`. So renderizado para trilhas do tipo CAMERA - posicao nao
   * faz sentido pra audio, e a trilha de tela e sempre o fundo do preview. */
  onSetTrackCameraTransform?: (trackId: string, transform: CameraTransform) => void
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
          <div className="timeline__track-label">
            <span>{TRACK_TYPE_LABELS[track.type]}</span>
            {onSetTrackGain && (
              <div className="timeline__track-gain-controls">
                <button
                  type="button"
                  className="timeline__track-mute"
                  aria-pressed={track.muted}
                  aria-label={track.muted ? 'Reativar som' : 'Silenciar trilha'}
                  title={track.muted ? 'Reativar som' : 'Silenciar trilha'}
                  onClick={() => onSetTrackGain(track.id, track.gainDb, !track.muted)}
                >
                  {track.muted ? 'Mudo' : 'Som'}
                </button>
                <input
                  type="range"
                  className="timeline__track-gain-slider"
                  min={-60}
                  max={0}
                  step={1}
                  value={track.gainDb}
                  aria-label={`Ganho da trilha ${TRACK_TYPE_LABELS[track.type]}`}
                  onChange={(event) =>
                    onSetTrackGain(track.id, Number(event.target.value), track.muted)
                  }
                />
              </div>
            )}
            {onSetTrackFade && (
              <div className="timeline__track-fade-controls">
                <label className="timeline__track-fade-field">
                  Fade in
                  <input
                    type="number"
                    className="timeline__track-fade-input"
                    min={0}
                    step={0.5}
                    value={track.fadeInMs / 1000}
                    aria-label={`Fade-in da trilha ${TRACK_TYPE_LABELS[track.type]} (segundos)`}
                    onChange={(event) =>
                      onSetTrackFade(
                        track.id,
                        Math.max(0, Math.round(Number(event.target.value) * 1000)),
                        track.fadeOutMs
                      )
                    }
                  />
                </label>
                <label className="timeline__track-fade-field">
                  Fade out
                  <input
                    type="number"
                    className="timeline__track-fade-input"
                    min={0}
                    step={0.5}
                    value={track.fadeOutMs / 1000}
                    aria-label={`Fade-out da trilha ${TRACK_TYPE_LABELS[track.type]} (segundos)`}
                    onChange={(event) =>
                      onSetTrackFade(
                        track.id,
                        track.fadeInMs,
                        Math.max(0, Math.round(Number(event.target.value) * 1000))
                      )
                    }
                  />
                </label>
              </div>
            )}
            {onSetTrackCameraTransform && track.type === 'CAMERA' && track.cameraTransform && (
              <CameraTransformControls
                trackId={track.id}
                trackLabel={TRACK_TYPE_LABELS[track.type]}
                transform={track.cameraTransform}
                onChange={onSetTrackCameraTransform}
              />
            )}
          </div>
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

/**
 * EDIT-010 - visibilidade (checkbox) + posicao/tamanho (sliders 0-100%) + forma (select) da trilha
 * CAMERA. Extraido num componente proprio (em vez de inline no `map` acima) so pra manter o corpo
 * de `Timeline` legivel - cinco controles e mais do que os dois de ganho/mudo.
 */
function CameraTransformControls({
  trackId,
  trackLabel,
  transform,
  onChange
}: {
  trackId: string
  trackLabel: string
  transform: CameraTransform
  onChange: (trackId: string, transform: CameraTransform) => void
}) {
  const update = (patch: Partial<CameraTransform>) => onChange(trackId, { ...transform, ...patch })
  return (
    <div className="timeline__track-transform-controls">
      <label className="timeline__track-transform-visible">
        <input
          type="checkbox"
          checked={transform.visible}
          aria-label={`Mostrar camera da trilha ${trackLabel}`}
          onChange={(event) => update({ visible: event.target.checked })}
        />
        Mostrar camera
      </label>
      <label className="timeline__track-transform-field">
        X
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={transform.xPercent}
          aria-label={`Posicao X da camera da trilha ${trackLabel} (porcentagem)`}
          onChange={(event) => update({ xPercent: Number(event.target.value) })}
        />
      </label>
      <label className="timeline__track-transform-field">
        Y
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={transform.yPercent}
          aria-label={`Posicao Y da camera da trilha ${trackLabel} (porcentagem)`}
          onChange={(event) => update({ yPercent: Number(event.target.value) })}
        />
      </label>
      <label className="timeline__track-transform-field">
        Largura
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={transform.widthPercent}
          aria-label={`Largura da camera da trilha ${trackLabel} (porcentagem)`}
          onChange={(event) => update({ widthPercent: Number(event.target.value) })}
        />
      </label>
      <label className="timeline__track-transform-field">
        Altura
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={transform.heightPercent}
          aria-label={`Altura da camera da trilha ${trackLabel} (porcentagem)`}
          onChange={(event) => update({ heightPercent: Number(event.target.value) })}
        />
      </label>
      <label className="timeline__track-transform-field">
        Forma
        <select
          value={transform.shape}
          aria-label={`Forma da camera da trilha ${trackLabel}`}
          onChange={(event) => update({ shape: event.target.value as CameraTransform['shape'] })}
        >
          <option value="rectangle">Retangulo</option>
          <option value="circle">Circulo</option>
        </select>
      </label>
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
