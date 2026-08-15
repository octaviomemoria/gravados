/**
 * EDIT-008 (decimo nono incremento - Fase 3, ganho/mudo). Converte `gainDb` (escala do editor,
 * ver `TimelineTrackSchema`) no `volume` LINEAR 0..1 - `10^(dB/20)` e a formula padrao de
 * conversao decibel->amplitude. `gainDb` ja e limitado a [-60, 0] no schema (sem amplificacao
 * acima do original), entao o resultado sempre cai dentro de `[~0.001, 1]`, mas o clamp aqui
 * protege contra qualquer valor fora da faixa que escape da validacao Zod.
 *
 * EXP-001 (vigesimo quarto incremento - Fase 4, render plan). Movido de
 * `renderer/features/editor/timeline-playback.ts` para `shared/media/` - o RENDER PLAN
 * (`main/media/render-plan.ts`) precisa da EXATA mesma curva de conversao dB->volume que o
 * preview ao vivo ja usa (`useMultiTrackPlayback`), senao o ganho ouvido no vídeo exportado
 * poderia soar DIFERENTE do que o usuário ajustou/ouviu no editor.
 */
export function dbToLinearVolume(gainDb: number): number {
  return Math.min(1, Math.max(0, Math.pow(10, gainDb / 20)))
}
