import { z } from 'zod'
import { IdSchema } from './common.schema'

/**
 * RECOV-003 (decimo incremento - Fase 2, reparo). Repara UM projeto `RECOVERABLE` (detectado no
 * boot por `RecoveryService.detectIncomplete`, RECOV-002) validando cada segmento contra o
 * arquivo real no disco. Ver `main/services/recovery.service.ts` para o raciocinio completo.
 */
export const RepairProjectRequestSchema = z.object({ id: IdSchema })
export type RepairProjectRequest = z.infer<typeof RepairProjectRequestSchema>

export const RepairProjectResponseSchema = z.object({
  projectId: IdSchema,
  status: z.enum(['COMPLETED', 'FAILED']),
  recoveredSegments: z.number().int().nonnegative(),
  discardedSegments: z.number().int().nonnegative()
})
export type RepairProjectResponse = z.infer<typeof RepairProjectResponseSchema>
