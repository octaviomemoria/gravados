import { z } from 'zod'
import { EmptyRequestSchema } from './common.schema'

/**
 * RF-002 (selecionar tela) + MVP-AC-001 ("visualizar e selecionar as fontes"). `kind` distingue
 * tela inteira/monitor de janela especifica - ambos vem da mesma chamada
 * `desktopCapturer.getSources({types: ['screen','window']})` (03_TECHNICAL_ARCHITECTURE.md).
 */
export const ScreenSourceKindSchema = z.enum(['screen', 'window'])

export const ScreenSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: ScreenSourceKindSchema,
  thumbnailDataUrl: z.string()
})
export type ScreenSource = z.infer<typeof ScreenSourceSchema>

export const ListScreenSourcesRequestSchema = EmptyRequestSchema
export const ListScreenSourcesResponseSchema = z.array(ScreenSourceSchema)
