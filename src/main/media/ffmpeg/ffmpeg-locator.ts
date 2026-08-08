/**
 * Localizador de binarios FFmpeg/FFprobe. Decisao registrada: nesta fase nenhum binario e
 * empacotado (`ffmpeg-static`/`ffprobe-static` deliberadamente nao instalados - ver README) porque
 * nada ainda invoca FFmpeg de verdade. Esta funcao da ao wrapper (`ffmpeg-runner.ts`) um unico
 * ponto de resolucao de caminho, pronto para a Fase 1/4 conectar um binario real sem refatoracao.
 */
export interface FfmpegBinaryPaths {
  ffmpegPath: string | null
  ffprobePath: string | null
}

export function resolveFfmpegBinaries(overrides?: Partial<FfmpegBinaryPaths>): FfmpegBinaryPaths {
  return {
    ffmpegPath: overrides?.ffmpegPath ?? process.env.MEETING_STUDIO_FFMPEG_PATH ?? null,
    ffprobePath: overrides?.ffprobePath ?? process.env.MEETING_STUDIO_FFPROBE_PATH ?? null
  }
}
