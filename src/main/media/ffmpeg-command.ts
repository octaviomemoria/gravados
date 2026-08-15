import { join } from 'node:path'
import { assertPathWithinBoundary } from './project-filesystem'
import type { RenderPlan, RenderClip } from './render-plan'

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4, "FFmpeg Plan" da doc - `05_MEDIA_EDITOR.md`
 * §12: `Edit Model → Timeline Compiler → FFmpeg Plan → Render Job → Validation → Output`).
 * Traduz um `RenderPlan` (estrutura de dados pura, EXP-001) num array de argumentos REAL de
 * linha de comando FFmpeg - cada elemento separado (AGENTS.md: nunca uma string concatenada via
 * `exec()`), pronto pra `runFfmpegProcess` (EXP-002).
 *
 * ESCOPO DESTE INCREMENTO: só trilha de fundo (`background`), sem `overlay`/`sideBySideRight` -
 * PiP e lado-a-lado exigem o filtro `overlay`/duas trilhas de vídeo simultâneas, registrado como
 * pendência pra um incremento futuro (EXP-004b). `buildFfmpegArgs` retorna `null` pra qualquer
 * plano fora desse escopo - o CHAMADOR (`ExportService`) decide como reagir (hoje: rejeita a
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

export function buildFfmpegArgs(
  plan: RenderPlan,
  projectRootPath: string,
  outputPath: string
): string[] | null {
  if (!plan.background) return null
  if (plan.overlay || plan.sideBySideRight) return null

  const args: string[] = ['-y']
  const filterParts: string[] = []
  const inputPathToIndex = new Map<string, number>()

  function addInput(relativePath: string): number {
    const absolutePath = resolveAbsolutePath(projectRootPath, relativePath)
    const existing = inputPathToIndex.get(absolutePath)
    if (existing !== undefined) return existing
    const index = inputPathToIndex.size
    inputPathToIndex.set(absolutePath, index)
    args.push('-i', absolutePath)
    return index
  }

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

  // --- Áudio (mixa todas as trilhas não-mutadas - EXP-001 já excluiu as mutadas do plano).
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

  let audioLabel: string | null = null
  if (audioTrackLabels.length === 1) {
    audioLabel = audioTrackLabels[0]!
  } else if (audioTrackLabels.length > 1) {
    filterParts.push(
      `${audioTrackLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioTrackLabels.length}:duration=longest:normalize=0[amix]`
    )
    audioLabel = 'amix'
  }
  if (audioLabel) {
    filterParts.push(
      `[${audioLabel}]atrim=start=${toSeconds(plan.output.startMs)}:end=${toSeconds(plan.output.endMs)},asetpts=PTS-STARTPTS[afinal]`
    )
  }

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', '[vfinal]')
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p')
  if (audioLabel) {
    args.push('-map', '[afinal]')
    args.push('-c:a', 'aac', '-b:a', '192k')
  } else {
    args.push('-an')
  }
  args.push('-movflags', '+faststart')
  args.push('-progress', 'pipe:1', '-nostats')
  args.push(outputPath)

  return args
}
