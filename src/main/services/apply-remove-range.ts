import type { TimelineClip, TimelineTrack } from '../../shared/schemas/editor.schema'

/**
 * EDIT-004/005/006 (decimo setimo incremento - Fase 3, primeira operacao de edicao real).
 * Nucleo puro do compilador de timeline editada: dado o estado atual das trilhas (cada uma com
 * seus clips) e um intervalo `[startMs, endMs)` a remover de TODAS as trilhas simultaneamente,
 * retorna as trilhas resultantes - clips inteiramente antes do corte ficam intocados, clips
 * inteiramente depois deslocam para a esquerda pela duracao removida, clips que se sobrepoem ao
 * corte sao truncados (ou DIVIDIDOS em dois, se o corte cai inteiramente dentro de um so clip) e
 * um clip inteiramente engolido pelo corte desaparece. Sem nenhum import de `electron` - pura o
 * bastante pra testar sem banco/disco, mesmo padrao ja usado por `segmentation-thresholds.ts`/
 * `disk-space-thresholds.ts`.
 *
 * Chamada uma vez por operacao `REMOVE_RANGE`, em sequencia (`EditorService.getEditedTimeline`) -
 * cada chamada opera sobre o resultado da anterior, entao `startMs`/`endMs` de cada operacao sao
 * sempre relativos a timeline JA editada pelas operacoes que vieram antes, nunca a bruta original.
 */
export function applyRemoveRange(
  tracks: TimelineTrack[],
  startMs: number,
  endMs: number
): TimelineTrack[] {
  const removedMs = endMs - startMs
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.flatMap((clip) => removeRangeFromClip(clip, startMs, endMs, removedMs))
  }))
}

function removeRangeFromClip(
  clip: TimelineClip,
  startMs: number,
  endMs: number,
  removedMs: number
): TimelineClip[] {
  // Inteiramente antes do corte (toca o inicio do corte no maximo) - nada muda.
  if (clip.endMs <= startMs) return [clip]

  // Inteiramente depois do corte (comeca exatamente onde o corte termina, no minimo) - so
  // desloca pra esquerda pela duracao removida; o offset dentro do arquivo nao muda.
  if (clip.startMs >= endMs) {
    return [{ ...clip, startMs: clip.startMs - removedMs, endMs: clip.endMs - removedMs }]
  }

  // A partir daqui ha sobreposicao real com `[startMs, endMs)`. Ate DOIS pedacos podem sobrar:
  // o que vem antes do corte (posicao/offset de origem intocados, so o fim e truncado) e o que
  // vem depois (reposicionado exatamente em `startMs` - o ponto onde o corte comeca na NOVA
  // timeline - com o offset de origem avancado pelo trecho descartado do proprio clip).
  const survivors: TimelineClip[] = []
  if (clip.startMs < startMs) {
    survivors.push({ ...clip, endMs: startMs })
  }
  if (clip.endMs > endMs) {
    survivors.push({
      ...clip,
      startMs,
      endMs: clip.endMs - removedMs,
      sourceStartMs: clip.sourceStartMs + (endMs - clip.startMs)
    })
  }
  // Se nenhum dos dois sobreviveu, o clip inteiro caiu dentro do intervalo removido.
  return survivors
}
