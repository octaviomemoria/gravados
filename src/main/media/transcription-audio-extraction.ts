import { join } from 'node:path'
import { assertPathWithinBoundary } from './project-filesystem'
import type { SegmentEntity } from '../../shared/types/entities'

/** Uma trilha capaz de audio (MICROFONE/audio do sistema) com seus segmentos JA finalizados,
 * ordenados por `seqIndex` - o formato minimo que `buildTranscriptionAudioExtractionArgs` precisa,
 * deliberadamente desacoplado de `TrackEntity`/`SegmentEntity` inteiros (o chamador decide como
 * filtrar/ordenar antes de montar isto). */
export interface AudioTrackForExtraction {
  trackId: string
  segments: Pick<SegmentEntity, 'relativePath'>[]
}

const WHISPER_SAMPLE_RATE = 16000

/**
 * Refinamento pos-SEARCH-001 (transcricao local, `WhisperLocalProvider`). Diferente de
 * `buildAudioFfmpegArgs` (EXP-005, que mixa a partir de um `RenderPlan` JA COMPILADO de um
 * projeto de EDICAO), esta funcao trabalha direto sobre as trilhas/segmentos da GRAVACAO BRUTA -
 * a transcricao opera sobre `projectId` (a gravacao), nunca um projeto de edicao (ver
 * `TranscriptionService.startTranscription`). Concatena os segmentos de cada trilha (na ordem que
 * foram gravados/rotacionados - RF-012/013), mixa todas as trilhas de audio disponiveis (`amix`,
 * so quando ha mais de uma) e resample pra 16kHz mono PCM16 - exatamente o formato que
 * `WhisperLocalProvider` sabe ler (`readWavPcm16Mono`) e que o modelo Whisper espera nativamente
 * (16kHz e a taxa de amostragem fixa do treino original, resample pra qualquer outra taxa so
 * degradaria a precisao sem necessidade). Retorna `null` (nunca lanca) quando nenhuma trilha tem
 * segmento algum - o CHAMADOR decide como reagir (nesta fase, isso e inatingivel de verdade
 * porque `startTranscription` ja valida que existe pelo menos uma trilha de audio antes de
 * enfileirar, mas o guard fica pela mesma razao defensiva ja registrada em `buildFfmpegArgs`).
 */
export function buildTranscriptionAudioExtractionArgs(
  tracks: readonly AudioTrackForExtraction[],
  projectRootPath: string,
  outputWavPath: string
): string[] | null {
  const args: string[] = ['-y']
  const inputPathToIndex = new Map<string, number>()
  function addInput(relativePath: string): number {
    const absolutePath = join(projectRootPath, ...relativePath.split('/'))
    assertPathWithinBoundary(absolutePath, projectRootPath)
    const existing = inputPathToIndex.get(absolutePath)
    if (existing !== undefined) return existing
    const index = inputPathToIndex.size
    inputPathToIndex.set(absolutePath, index)
    args.push('-i', absolutePath)
    return index
  }

  const filterParts: string[] = []
  const trackLabels: string[] = []
  for (const [trackIndex, track] of tracks.entries()) {
    if (track.segments.length === 0) continue
    const segmentLabels = track.segments.map((segment, segmentIndex) => {
      const inputIndex = addInput(segment.relativePath)
      const label = `a${trackIndex}_${segmentIndex}`
      filterParts.push(`[${inputIndex}:a]asetpts=PTS-STARTPTS[${label}]`)
      return label
    })
    if (segmentLabels.length === 1) {
      trackLabels.push(segmentLabels[0]!)
      continue
    }
    const concatLabel = `atconcat${trackIndex}`
    filterParts.push(
      `${segmentLabels.map((label) => `[${label}]`).join('')}concat=n=${segmentLabels.length}:v=0:a=1[${concatLabel}]`
    )
    trackLabels.push(concatLabel)
  }

  if (trackLabels.length === 0) return null

  let finalLabel = trackLabels[0]!
  if (trackLabels.length > 1) {
    filterParts.push(
      `${trackLabels.map((label) => `[${label}]`).join('')}amix=inputs=${trackLabels.length}:duration=longest:normalize=0[amix]`
    )
    finalLabel = 'amix'
  }

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', `[${finalLabel}]`)
  args.push('-ar', String(WHISPER_SAMPLE_RATE))
  args.push('-ac', '1')
  args.push('-c:a', 'pcm_s16le')
  args.push(outputWavPath)
  return args
}
