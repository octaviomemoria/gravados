import ffmpegStaticPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * Localizador de binarios FFmpeg/FFprobe. EXP-002 (vigesimo quarto incremento - Fase 4) -
 * `ffmpeg-static`/`ffprobe-static` agora instalados (baixam o binario real da plataforma no
 * `postinstall`, ~80MB combinados - decisao registrada, aprovados via `pnpm approve-builds`
 * porque pnpm bloqueia scripts de instalacao de dependencias novas por padrao,
 * `pnpm-workspace.yaml` `allowBuilds`). Prioridade de resolucao: override explicito (testes) >
 * variavel de ambiente (`MEETING_STUDIO_FFMPEG_PATH`/`_FFPROBE_PATH`, criada nesta fase pra poder
 * apontar pra um binario diferente sem reconstruir - util em CI/empacotamento futuro) > o pacote
 * `-static` instalado. Nunca `null` em condicoes normais desde este incremento, mas o tipo
 * continua `string | null` - um ambiente sem os pacotes instalados (ex.: um fork que remove a
 * dependencia) ainda degrada sem lancar aqui; quem CHAMA o FFmpeg (`ExportService`, incremento
 * futuro) e quem decide rejeitar a exportacao se `null`.
 */
export interface FfmpegBinaryPaths {
  ffmpegPath: string | null
  ffprobePath: string | null
}

export function resolveFfmpegBinaries(overrides?: Partial<FfmpegBinaryPaths>): FfmpegBinaryPaths {
  return {
    ffmpegPath:
      overrides?.ffmpegPath ?? process.env.MEETING_STUDIO_FFMPEG_PATH ?? ffmpegStaticPath ?? null,
    ffprobePath:
      overrides?.ffprobePath ??
      process.env.MEETING_STUDIO_FFPROBE_PATH ??
      ffprobeStatic.path ??
      null
  }
}
