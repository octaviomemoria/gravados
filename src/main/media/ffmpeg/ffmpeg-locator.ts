import { sep } from 'node:path'
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

/**
 * Bug real encontrado testando transcricao no app EMPACOTADO (nunca pego antes - nenhum teste
 * automatizado roda contra um `.asar` de verdade, so `pnpm dev`/unit/E2E, onde nao existe asar
 * nenhum e o caminho ja sai correto por acidente). `ffmpeg-static`/`ffprobe-static` calculam o
 * proprio caminho via `path.join(__dirname, ...)` sem NENHUMA nocao de asar - dentro de um app
 * empacotado, `__dirname` de um modulo carregado de dentro do `.asar` continua literalmente
 * apontando pra `...\app.asar\node_modules\...` (o `require()` funciona atraves do arquivo via
 * um shim do Electron, mas a STRING do caminho nunca muda). `spawn()` (diferente de `fs.readFile`)
 * NAO tem esse shim - precisa de um arquivo de verdade em disco, exatamente o que `asarUnpack`
 * (electron-builder.yml) ja extrai pra `app.asar.unpacked` - so faltava o CODIGO trocar o
 * segmento do caminho antes de spawnar. Fora de um app empacotado (dev/testes, sem `.asar` real)
 * o caminho nunca contem `app.asar`, entao isto e sempre um no-op ali.
 */
export function unpackAsarPath(candidate: string | null): string | null {
  if (!candidate) return null
  const asarSegment = `app.asar${sep}`
  return candidate.includes(asarSegment) ? candidate.replace(asarSegment, `app.asar.unpacked${sep}`) : candidate
}

export function resolveFfmpegBinaries(overrides?: Partial<FfmpegBinaryPaths>): FfmpegBinaryPaths {
  return {
    ffmpegPath:
      overrides?.ffmpegPath ??
      process.env.MEETING_STUDIO_FFMPEG_PATH ??
      unpackAsarPath(ffmpegStaticPath) ??
      null,
    ffprobePath:
      overrides?.ffprobePath ??
      process.env.MEETING_STUDIO_FFPROBE_PATH ??
      unpackAsarPath(ffprobeStatic.path) ??
      null
  }
}
