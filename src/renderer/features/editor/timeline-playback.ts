import type { TimelineClip } from '@shared/schemas/editor.schema'

/**
 * EDIT-003 parte 2 (Fase 3, Editor MVP). Logica PURA por tras do player multi-trilha: dado um
 * instante global (mesmo eixo 0-based da timeline, ancorado no inicio da sessao de gravacao - ver
 * `editor.schema.ts`), qual clip de uma trilha esta ativo, e qual o instante LOCAL dentro do
 * arquivo daquele clip. Extraida separada do hook `useMultiTrackPlayback` (que manipula
 * `HTMLMediaElement`/`requestAnimationFrame` diretamente, dificil e de baixo valor mockar em
 * Vitest) para ficar testavel sem qualquer DOM - mesmo padrao ja usado para
 * `segmentation-thresholds.ts` (hook vs. logica pura extraida).
 */

/**
 * Retorna o clip que cobre `globalTimeMs` nesta trilha. Se o instante cair DEPOIS do ultimo clip
 * ou num intervalo ENTRE dois clips (ex.: trilha que parou de gravar antes do fim da sessao, ou
 * um gap real entre segmentos), retorna `null` - a trilha fica pausada ate o proximo clip
 * comecar. Mas se o instante cair ANTES do PRIMEIRO clip, retorna esse primeiro clip mesmo assim
 * (nunca `null`) - cada trilha abre seu primeiro segmento alguns milissegundos depois do instante
 * 0 da sessao inteira (mesmo atraso assincrono documentado na timeline somente-leitura, EDIT-002),
 * entao `globalTimeMs = 0` quase nunca cai EXATAMENTE dentro do primeiro clip; sem este caso
 * especial, carregar o instante inicial (`useMultiTrackPlayback`, ao montar) nunca encontraria
 * clip nenhum e o preview ficaria pra sempre sem nenhum frame carregado. Clips nao se sobrepoem
 * por construcao (`EditorService.getTimeline`), entao no maximo um resultado "coberto" e possivel.
 */
export function findClipAtTime(clips: TimelineClip[], globalTimeMs: number): TimelineClip | null {
  const covering = clips.find(
    (clip) => globalTimeMs >= clip.startMs && globalTimeMs <= clip.endMs
  )
  if (covering) return covering
  const first = clips[0]
  if (first && globalTimeMs < first.startMs) return first
  return null
}

/**
 * Converte um instante global (ms, eixo da timeline) no instante LOCAL (segundos, eixo do
 * `<video>`/`<audio>` daquele clip especifico) - o valor a atribuir a `element.currentTime`.
 * Limitado a `[0, duracao do clip]` para nunca produzir um seek invalido por arredondamento.
 */
export function clipLocalTimeSeconds(clip: TimelineClip, globalTimeMs: number): number {
  const durationMs = Math.max(0, clip.endMs - clip.startMs)
  const localMs = Math.min(Math.max(0, globalTimeMs - clip.startMs), durationMs)
  return localMs / 1000
}

/**
 * Tolerancia de dessincronia entre o relogio "mestre" (software clock em `useMultiTrackPlayback`,
 * avancado via `requestAnimationFrame`/`performance.now()`) e o `currentTime` real de cada
 * elemento de midia. Elementos HTML de midia podem atrasar/adiantar sozinhos (decodificacao,
 * buffering) - corrigir a CADA frame seria custoso e visualmente instavel (micro-stutters); so
 * corrigimos quando o desvio ultrapassa este limiar. 250ms e imperceptivel para revisao de
 * gravacao (nao e um editor profissional sample-accurate).
 */
export const DRIFT_THRESHOLD_SECONDS = 0.25

export function isDrifting(
  actualSeconds: number,
  expectedSeconds: number,
  thresholdSeconds = DRIFT_THRESHOLD_SECONDS
): boolean {
  return Math.abs(actualSeconds - expectedSeconds) > thresholdSeconds
}

/**
 * Converte uma posicao de clique/arrasto (pixels, relativa ao elemento clicado - regua ou uma
 * lane de trilha, ambas usam a mesma escala percentual `0..totalMs` que os proprios marcos/clips
 * ja desenham) no instante global correspondente, em ms, sempre dentro de `[0, totalMs]`.
 */
export function msFromPointerOffset(
  offsetX: number,
  elementWidthPx: number,
  totalMs: number
): number {
  if (elementWidthPx <= 0) return 0
  const ratio = Math.min(Math.max(offsetX / elementWidthPx, 0), 1)
  return Math.round(ratio * totalMs)
}
