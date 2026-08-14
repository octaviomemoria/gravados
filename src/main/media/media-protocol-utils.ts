import { SOURCE_ROOT_FOLDER_NAME } from '../../shared/constants/filesystem'

/**
 * EDIT-003 (decimo quarto incremento - Fase 3, preview). Funcoes puras usadas pelo handler do
 * protocolo `meeting-media://` (`media-protocol.ts`) - separadas deliberadamente num arquivo sem
 * nenhum import de `electron`, testavel diretamente pelo Vitest (mesmo padrao ja usado por
 * `disk-space-thresholds.ts`/`segmentation-thresholds.ts`: nenhum arquivo que importa `electron`
 * de verdade neste projeto tem teste unitario dedicado - so os que ficam livres disso).
 */

const VIDEO_SUBFOLDERS = new Set(['screen', 'camera'])

/**
 * O Content-Type e derivado da SUBPASTA dentro de `source/`, nunca so da extensao - todo
 * segmento e sempre `.webm`, mas o container carrega video+audio (tela/camera) ou so audio
 * (microfone/audio do sistema); o `<video>`/`<audio>` do navegador precisa do tipo certo pra
 * decidir como decodificar o arquivo.
 */
export function guessMediaContentType(relativePath: string): string {
  const segments = relativePath.split(/[\\/]+/).filter((segment) => segment.length > 0)
  const sourceIndex = segments.indexOf(SOURCE_ROOT_FOLDER_NAME)
  const subfolder = sourceIndex >= 0 ? segments[sourceIndex + 1] : undefined
  return subfolder && VIDEO_SUBFOLDERS.has(subfolder) ? 'video/webm' : 'audio/webm'
}

export interface ParsedRange {
  start: number
  end: number
}

/**
 * So suporta um unico range simples (`bytes=N-M` ou `bytes=N-`) - suficiente para `<video>`/
 * `<audio>`, que nunca pedem multi-range. Retorna `null` para qualquer coisa ausente/invalida/
 * fora dos limites do arquivo - o chamador entao serve o arquivo inteiro (200), comportamento
 * HTTP padrao quando o `Range` nao pode ser satisfeito.
 */
export function parseRangeHeader(rangeHeader: string | null, fileSize: number): ParsedRange | null {
  if (!rangeHeader) return null
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return null

  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : fileSize - 1
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    end >= fileSize
  ) {
    return null
  }
  return { start, end }
}

/**
 * Alem de `assertPathWithinBoundary` (que so protege contra escapar do `rootPath` real do
 * projeto), este e um filtro de FORMATO em defesa profunda - so aceita o padrao exato que o
 * proprio app produz (`source/<tipo>/<arquivo>.webm`), nunca qualquer outro path relativo dentro
 * do projeto (ex.: `manifest.json`, `recovery/`). O renderer nunca deveria pedir nada fora disso,
 * mas o handler nao confia em nenhum dado vindo de fora do processo main.
 */
const MEDIA_RELATIVE_PATH_PATTERN =
  /^source\/(screen|camera|microphone|system-audio)\/[a-zA-Z0-9_.-]+\.webm$/

export function isValidMediaRelativePath(relativePath: string): boolean {
  return MEDIA_RELATIVE_PATH_PATTERN.test(relativePath)
}
