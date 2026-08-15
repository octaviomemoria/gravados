import { join } from 'node:path'
import { assertPathWithinBoundary } from './project-filesystem'
import type { RenderPlan, RenderClip, RenderVideoLayer } from './render-plan'
import type { AudioExportFormat } from '../../shared/schemas/export.schema'

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4, "FFmpeg Plan" da doc - `05_MEDIA_EDITOR.md`
 * §12: `Edit Model → Timeline Compiler → FFmpeg Plan → Render Job → Validation → Output`). Traduz
 * um `RenderPlan` (estrutura de dados pura, EXP-001) num array de argumentos REAL de linha de
 * comando FFmpeg - cada elemento separado (AGENTS.md: nunca uma string concatenada via `exec()`),
 * pronto pra `runFfmpegProcess` (EXP-002).
 *
 * `buildFfmpegArgs` (VIDEO, EXP-004b): compoe TRES layouts de video possiveis, espelhando
 * exatamente os 3 modos reais de `computePreviewLayout`/`buildRenderPlan` - trilha unica
 * (`background`), PiP (`background` + `overlay`, filtro `overlay`) e lado-a-lado (`background` +
 * `sideBySideRight`, filtro `hstack`). `buildAudioFfmpegArgs` (EXP-005, AUDIO): mesma mixagem de
 * audio compartilhada (`buildAudioMixFilter`), sem trilha de video nenhuma - produz um M4A/MP3/WAV.
 * Ambas retornam `null` (nunca lancam) pra qualquer plano fora do proprio escopo (ex.: `background`
 * ausente, ou `overlay`+`sideBySideRight` simultaneos - inatingivel via `buildRenderPlan` real, mas
 * um guard defensivo barato) - o CHAMADOR (`ExportService`) decide como reagir (hoje: rejeita a
 * exportação com uma mensagem clara).
 */

function resolveAbsolutePath(projectRootPath: string, relativePath: string): string {
  const absolutePath = join(projectRootPath, ...relativePath.split('/'))
  assertPathWithinBoundary(absolutePath, projectRootPath)
  return absolutePath
}

function toSeconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}

/**
 * Um clip vira dois filtros: `trim`/`atrim` (corta o trecho certo DENTRO do arquivo de origem,
 * usando `sourceStartMs`/`durationMs` já resolvidos pelo EXP-001) seguido de `setpts`/`asetpts`
 * (reseta o carimbo de tempo pra 0 - sem isso, concatenar dois clips do MEIO de arquivos
 * diferentes produziria timestamps fora de ordem).
 */
function buildTrimFilter(kind: 'v' | 'a', inputIndex: number, clip: RenderClip, label: string): string {
  const filterName = kind === 'v' ? 'trim' : 'atrim'
  const ptsFilter = kind === 'v' ? 'setpts=PTS-STARTPTS' : 'asetpts=PTS-STARTPTS'
  return `[${inputIndex}:${kind}]${filterName}=start=${toSeconds(clip.sourceStartMs)}:duration=${toSeconds(clip.durationMs)},${ptsFilter}[${label}]`
}

/**
 * Registra cada arquivo de origem UMA vez (`-i` deduplicado por caminho absoluto) e devolve o
 * indice de input FFmpeg correspondente - compartilhado entre `buildFfmpegArgs` e
 * `buildAudioFfmpegArgs` (EXP-005) pra nao duplicar a logica de resolucao/dedupe/validacao de
 * caminho (`assertPathWithinBoundary`) em dois lugares.
 */
function createInputRegistrar(
  projectRootPath: string,
  args: string[]
): (relativePath: string) => number {
  const inputPathToIndex = new Map<string, number>()
  return function addInput(relativePath: string): number {
    const absolutePath = resolveAbsolutePath(projectRootPath, relativePath)
    const existing = inputPathToIndex.get(absolutePath)
    if (existing !== undefined) return existing
    const index = inputPathToIndex.size
    inputPathToIndex.set(absolutePath, index)
    args.push('-i', absolutePath)
    return index
  }
}

/**
 * EXP-005 - mixagem de audio compartilhada entre `buildFfmpegArgs` (video - o resultado vira uma
 * trilha extra do MP4) e `buildAudioFfmpegArgs` (so audio - o resultado E o arquivo de saida
 * inteiro). Constroi, por trilha: `atrim`+`asetpts` por clip, `concat` se a trilha tiver mais de
 * um clip (REMOVE_RANGE partindo um segmento, ou segmentacao por tempo/tamanho gerando varios
 * arquivos - tratados identicamente), `volume`, e `afade` se houver fade configurado. Ao final,
 * `amix` SO quando ha MAIS de uma trilha de audio (evita um estagio de filtro desnecessario pra
 * uma unica trilha). Retorna o rotulo do filtro final (ANTES do trim pela faixa de tempo -
 * aplicado por cada chamador separadamente, ja que o rotulo de saida final difere entre os dois:
 * `[afinal]` mapeado junto de `[vfinal]` no caso video, `[afinal]` sozinho no caso audio) ou
 * `null` quando o plano nao tem nenhuma trilha de audio com clip algum.
 */
function buildAudioMixFilter(
  plan: RenderPlan,
  addInput: (relativePath: string) => number,
  filterParts: string[]
): string | null {
  const audioTrackLabels: string[] = []
  for (const [trackIndex, track] of plan.audio.entries()) {
    const clipLabels = track.clips.map((clip, clipIndex) => {
      const inputIndex = addInput(clip.relativePath)
      const label = `a${trackIndex}_${clipIndex}`
      filterParts.push(buildTrimFilter('a', inputIndex, clip, label))
      return label
    })
    if (clipLabels.length === 0) continue

    let currentLabel = clipLabels[0]!
    if (clipLabels.length > 1) {
      const concatLabel = `atconcat${trackIndex}`
      filterParts.push(
        `${clipLabels.map((label) => `[${label}]`).join('')}concat=n=${clipLabels.length}:v=0:a=1[${concatLabel}]`
      )
      currentLabel = concatLabel
    }

    const volumeLabel = `avol${trackIndex}`
    filterParts.push(`[${currentLabel}]volume=${track.volume.toFixed(4)}[${volumeLabel}]`)
    currentLabel = volumeLabel

    if (track.fadeInMs > 0 || track.fadeOutMs > 0) {
      const fadeFilters: string[] = []
      if (track.fadeInMs > 0) {
        fadeFilters.push(`afade=t=in:st=0:d=${toSeconds(track.fadeInMs)}`)
      }
      if (track.fadeOutMs > 0) {
        const trackEndMs = track.clips.reduce(
          (max, clip) => Math.max(max, clip.timelineStartMs + clip.durationMs),
          0
        )
        const fadeOutStartMs = Math.max(0, trackEndMs - track.fadeOutMs)
        fadeFilters.push(`afade=t=out:st=${toSeconds(fadeOutStartMs)}:d=${toSeconds(track.fadeOutMs)}`)
      }
      const fadeLabel = `afade${trackIndex}`
      filterParts.push(`[${currentLabel}]${fadeFilters.join(',')}[${fadeLabel}]`)
      currentLabel = fadeLabel
    }

    audioTrackLabels.push(currentLabel)
  }

  if (audioTrackLabels.length === 0) return null
  if (audioTrackLabels.length === 1) return audioTrackLabels[0]!

  filterParts.push(
    `${audioTrackLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioTrackLabels.length}:duration=longest:normalize=0[amix]`
  )
  return 'amix'
}

/**
 * EXP-004b - concatena os clips de UMA camada de vídeo (fundo, overlay OU lado-a-lado direito -
 * as tres tem exatamente a mesma forma, `RenderVideoLayer`) num unico rotulo de filtro, reusado
 * pelos tres. Mesma logica que ja existia inline so pra `background` antes deste incremento -
 * extraida pra evitar triplicar o mesmo `map`+`concat` pras outras duas camadas.
 */
function buildConcatVideoLabel(
  layer: RenderVideoLayer,
  labelPrefix: string,
  filterParts: string[],
  addInput: (relativePath: string) => number
): string | null {
  const clipLabels = layer.clips.map((clip, index) => {
    const inputIndex = addInput(clip.relativePath)
    const label = `${labelPrefix}${index}`
    filterParts.push(buildTrimFilter('v', inputIndex, clip, label))
    return label
  })
  if (clipLabels.length === 0) return null // camada sem nenhum clip - defensivo (getEditedTimeline ja filtra).
  if (clipLabels.length === 1) return clipLabels[0]!
  const concatLabel = `${labelPrefix}concat`
  filterParts.push(
    `${clipLabels.map((label) => `[${label}]`).join('')}concat=n=${clipLabels.length}:v=1:a=0[${concatLabel}]`
  )
  return concatLabel
}

/** `scale` (preserva proporcao, encolhe) + `pad` (preenche com preto ate o tamanho exato) - o
 * mesmo par usado pra "caber" um vídeo de fundo/lado-a-lado inteiro dentro de uma caixa, sem
 * cortar nada (equivalente ao comportamento observado no preview ao vivo pro lado-a-lado, que
 * nunca recorta - so a camada PiP usa "cover", ver `buildOverlayScaleCrop`). */
function scalePadFilter(label: string, width: number, height: number): string {
  return `[${label}]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`
}

export function buildFfmpegArgs(
  plan: RenderPlan,
  projectRootPath: string,
  outputPath: string
): string[] | null {
  if (!plan.background) return null
  if (plan.overlay && plan.sideBySideRight) return null // inatingivel via buildRenderPlan real - guard defensivo barato.

  const args: string[] = ['-y']
  const filterParts: string[] = []
  const addInput = createInputRegistrar(projectRootPath, args)
  const { width, height } = plan.output

  const backgroundLabel = buildConcatVideoLabel(plan.background, 'bgv', filterParts, addInput)
  if (!backgroundLabel) return null

  let compositedLabel: string
  if (plan.overlay) {
    // --- PiP (EXP-004b) - camera sobreposta na tela de fundo, posicao/tamanho/forma vindos de
    // `cameraTransform` (EDIT-010). `shape: 'circle'` NAO recorta um circulo de verdade no
    // arquivo exportado (mesma simplificacao ja documentada no preview ao vivo, que so aproxima
    // via `border-radius` CSS - ver "Pendências conhecidas") - implementar um mascaramento
    // circular real via `geq`/`alphamerge` ficaria fora do escopo deste incremento.
    const overlayLabel = buildConcatVideoLabel(plan.overlay, 'ovv', filterParts, addInput)
    if (!overlayLabel) return null

    filterParts.push(`${scalePadFilter(backgroundLabel, width, height)}[bgscaled]`)

    // `object-fit: cover` no preview ao vivo (`.editor-preview-overlay`, EDIT-010) - o overlay
    // preenche a caixa inteira, recortando o excesso, nunca deixando faixas pretas dentro dela.
    // `scale=...:force_original_aspect_ratio=increase` + `crop` e o equivalente FFmpeg exato.
    const overlayWidth = Math.round((plan.overlay.widthPercent / 100) * width)
    const overlayHeight = Math.round((plan.overlay.heightPercent / 100) * height)
    // `left`/`top` no CSS do preview (nao um centro) - `xPercent`/`yPercent` sao a posicao do
    // canto SUPERIOR ESQUERDO da caixa, relativa ao container inteiro, exatamente como `overlay=x:y`.
    const overlayX = Math.round((plan.overlay.xPercent / 100) * width)
    const overlayY = Math.round((plan.overlay.yPercent / 100) * height)
    filterParts.push(
      `[${overlayLabel}]scale=${overlayWidth}:${overlayHeight}:force_original_aspect_ratio=increase,crop=${overlayWidth}:${overlayHeight},setsar=1[ovscaled]`
    )
    // `eof_action=pass` (nao o `repeat` padrao do FFmpeg) - se a trilha da camera terminar antes
    // da tela de fundo (ex.: camera parou de gravar mais cedo), o overlay simplesmente DESAPARECE
    // dali em diante, em vez de congelar o ultimo quadro pra sempre por cima do fundo.
    filterParts.push(
      `[bgscaled][ovscaled]overlay=x=${overlayX}:y=${overlayY}:eof_action=pass[vcomposited]`
    )
    compositedLabel = 'vcomposited'
  } else if (plan.sideBySideRight) {
    // --- Lado-a-lado (EXP-004b) - cada trilha ocupa exatamente metade da largura de saida, altura
    // inteira, cada uma com "scale+pad" (nunca recorta - mesmo comportamento do preview ao vivo,
    // que nao usa `object-fit: cover` pro lado-a-lado, so pro overlay PiP). `RESOLUTION_DIMENSIONS`
    // (render-plan.ts) sempre gera `width` par, entao a divisao por 2 e sempre exata.
    const rightLabel = buildConcatVideoLabel(plan.sideBySideRight, 'rsv', filterParts, addInput)
    if (!rightLabel) return null

    const halfWidth = width / 2
    filterParts.push(`${scalePadFilter(backgroundLabel, halfWidth, height)}[left]`)
    filterParts.push(`${scalePadFilter(rightLabel, halfWidth, height)}[right]`)
    filterParts.push('[left][right]hstack=inputs=2[vcomposited]')
    compositedLabel = 'vcomposited'
  } else {
    // --- Trilha unica (comportamento original desde EXP-003/004).
    filterParts.push(`${scalePadFilter(backgroundLabel, width, height)}[vcomposited]`)
    compositedLabel = 'vcomposited'
  }

  filterParts.push(
    `[${compositedLabel}]trim=start=${toSeconds(plan.output.startMs)}:end=${toSeconds(plan.output.endMs)},setpts=PTS-STARTPTS[vfinal]`
  )

  // --- Áudio (mixa todas as trilhas não-mutadas e capazes de audio - EXP-001/EXP-003/004 ja
  // excluiram trilhas mutadas e CAMERA/SCREEN do plano, ver render-plan.ts).
  const audioMixLabel = buildAudioMixFilter(plan, addInput, filterParts)
  let audioLabel: string | null = null
  if (audioMixLabel) {
    filterParts.push(
      `[${audioMixLabel}]atrim=start=${toSeconds(plan.output.startMs)}:end=${toSeconds(plan.output.endMs)},asetpts=PTS-STARTPTS[afinal]`
    )
    audioLabel = 'afinal'
  }

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', '[vfinal]')
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p')
  if (audioLabel) {
    args.push('-map', `[${audioLabel}]`)
    args.push('-c:a', 'aac', '-b:a', '192k')
  } else {
    args.push('-an')
  }
  args.push('-movflags', '+faststart')
  args.push('-progress', 'pipe:1', '-nostats')
  args.push(outputPath)

  return args
}

/**
 * EXP-005 (vigesimo sexto incremento - Fase 4, RF-033). Traduz a mixagem de audio de um
 * `RenderPlan` num comando FFmpeg SO DE AUDIO - M4A (`aac`), MP3 (`libmp3lame`) ou WAV
 * (`pcm_s16le`, sem compressao). Ignora inteiramente `plan.background`/`overlay`/
 * `sideBySideRight`/`output.width`/`height` (nao fazem sentido pra um arquivo sem stream de
 * video) - so olha `plan.audio`/`output.startMs`/`endMs`. Retorna `null` quando o plano nao tem
 * nenhuma trilha de audio com clip algum (nada pra exportar) - o CHAMADOR (`ExportService`)
 * decide como reagir.
 */
export function buildAudioFfmpegArgs(
  plan: RenderPlan,
  projectRootPath: string,
  outputPath: string,
  format: AudioExportFormat
): string[] | null {
  if (plan.audio.length === 0) return null

  const args: string[] = ['-y']
  const filterParts: string[] = []
  const addInput = createInputRegistrar(projectRootPath, args)

  const audioMixLabel = buildAudioMixFilter(plan, addInput, filterParts)
  if (!audioMixLabel) return null // trilhas de audio existem no plano, mas nenhuma tem clip algum (defensivo).

  filterParts.push(
    `[${audioMixLabel}]atrim=start=${toSeconds(plan.output.startMs)}:end=${toSeconds(plan.output.endMs)},asetpts=PTS-STARTPTS[afinal]`
  )

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', '[afinal]')
  args.push('-vn')

  if (format === 'M4A') {
    args.push('-c:a', 'aac', '-b:a', '192k')
  } else if (format === 'MP3') {
    args.push('-c:a', 'libmp3lame', '-b:a', '192k')
  } else {
    // WAV - PCM linear sem compressao, `-b:a` nao se aplica a um codec nao-lossy baseado em bitrate.
    args.push('-c:a', 'pcm_s16le')
  }

  args.push('-progress', 'pipe:1', '-nostats')
  args.push(outputPath)

  return args
}
