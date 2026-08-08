import { desktopCapturer } from 'electron'
import type { ScreenSource } from '../../shared/schemas/devices.schema'

/**
 * RF-002 - Selecionar tela (tela inteira, monitor especifico, janela especifica).
 * `desktopCapturer` so existe no processo main - o renderer nunca o acessa diretamente (sem
 * nodeIntegration); o `id` retornado e reenviado depois como `chromeMediaSourceId` na chamada de
 * `getUserMedia` feita pelo renderer para efetivamente capturar a fonte escolhida (Fase 1,
 * proximo incremento - aqui apenas listamos/mostramos miniaturas para selecao, AC-001).
 */
const THUMBNAIL_SIZE = { width: 320, height: 180 }

/** `id` vem no formato `screen:ZZ:0` ou `window:XX:YY` (docs do Electron) - extraido para funcao
 * pura e testavel separadamente da chamada real ao desktopCapturer. */
export function classifySourceKind(sourceId: string): ScreenSource['kind'] {
  return sourceId.startsWith('window:') ? 'window' : 'screen'
}

export async function listScreenSources(): Promise<ScreenSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: THUMBNAIL_SIZE
  })

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: classifySourceKind(source.id),
    thumbnailDataUrl: source.thumbnail.toDataURL()
  }))
}
