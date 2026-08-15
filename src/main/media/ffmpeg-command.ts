import { join } from 'node:path'
import { assertPathWithinBoundary } from './project-filesystem'
import type { RenderPlan, RenderClip } from './render-plan'
import type { AudioExportFormat } from '../../shared/schemas/export.schema'

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4, "FFmpeg Plan" da doc - `05_MEDIA_EDITOR.md`
 * §12: `Edit Model → Timeline Compiler → FFmpeg Plan → Render Job → Validation → Output`). Traduz
 * um `RenderPlan` (estrutura de dados pura, EXP-001) num array de argumentos REAL de linha de
 * comando FFmpeg - cada elemento separado (AGENTS.md: nunca uma string concatenada via `exec()`),
 * pronto pra `runFfmpegProcess` (EXP-002).
 *
 * `buildFfmpegArgs` (VIDEO): ESCOPO so trilha de fundo (`background`), sem `overlay`/
 * `sideBySideRight` - PiP e lado-a-lado exigem o filtro `overlay`/duas trilhas de vídeo
 * simultâneas, registrado como pendência pra um incremento futuro (EXP-004b).
 * `buildAudioFfmpegArgs` (EXP-005, AUDIO): mesma mixagem de audio compartilhada
 * (`buildAudioMixFilter`), sem trilha de video nenhuma - produz um M4A/MP3/WAV.
 * Ambas retornam `null` (nunca lancam) pra qualquer plano fora do proprio escopo - o CHAMADOR
 * (`ExportService`) decide como reagir (hoje: rejeita a exportação com uma mensagem clara).
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

export function buildFfmpegArgs(
  plan: RenderPlan,
  projectRootPath: string,
  outputPath: string
): string[] | null {
  if (!plan.background) return null
  if (plan.overlay || plan.sideBySideRight) return null

  const args: string[] = ['-y']
  const filterParts: string[] = []
  const addInput = createInputRegistrar(projectRootPath, args)

  // --- Vídeo (trilha de fundo) - concatena todos os clips (um REMOVE_RANGE no meio de um clip
  // produz DOIS a partir do MESMO segmento; segmentação por tempo/tamanho produz varios arquivos
  // diferentes - ambos os casos viram multiplos elementos aqui, tratados identicamente).
  const videoClipLabels = (plan.background?.clips ?? []).map((clip, index) => {
    const inputIndex = addInput(clip.relativePath)
    const label = `bgv${index}`
    filterParts.push(buildTrimFilter('v', inputIndex, clip, label))
    return label
  })
  let videoLabel = videoClipLabels[0] ?? null
  if (videoClipLabels.length > 1) {
    filterParts.push(
      `${videoClipLabels.map((label) => `[${label}]`).join('')}concat=n=${videoClipLabels.length}:v=1:a=0[vconcat]`
    )
    videoLabel = 'vconcat'
  }
  if (!videoLabel) return null // trilha de fundo sem nenhum clip - nao deveria acontecer (getEditedTimeline ja filtra), defensivo.
  filterParts.push(
    `[${videoLabel}]scale=${plan.output.width}:${plan.output.height}:force_original_aspect_ratio=decrease,pad=${plan.output.width}:${plan.output.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,trim=start=${toSeconds(plan.output.startMs)}:end=${toSeconds(plan.output.endMs)},setpts=PTS-STARTPTS[vfinal]`
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
