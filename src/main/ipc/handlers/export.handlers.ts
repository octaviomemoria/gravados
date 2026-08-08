import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  StartExportRequestSchema,
  StartExportResponseSchema,
  ListExportJobsRequestSchema,
  ListExportJobsResponseSchema,
  GetExportStatusRequestSchema,
  GetExportStatusResponseSchema
} from '../../../shared/schemas/export.schema'
import { NotFoundError, NotImplementedError } from '../../../shared/types/domain-errors'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * Decisao registrada: `start` fica registrado/tipado/validado mas retorna `NotImplementedError` -
 * a implementacao real (Timeline Compiler + FFmpeg) e Fase 4 - Export. `list`/`getStatus` sao
 * reais desde ja (leem a tabela `export_jobs`, hoje sempre vazia).
 */
export function registerExportHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.export.start,
    { request: StartExportRequestSchema, response: StartExportResponseSchema },
    async () => {
      throw new NotImplementedError('Exportacao real ainda nao esta implementada (Fase 4 - Export).')
    }
  )

  registerHandler(
    IPC_CHANNELS.export.list,
    { request: ListExportJobsRequestSchema, response: ListExportJobsResponseSchema },
    async () => context.exportJobRepository.list()
  )

  registerHandler(
    IPC_CHANNELS.export.getStatus,
    { request: GetExportStatusRequestSchema, response: GetExportStatusResponseSchema },
    async (request) => {
      const job = context.exportJobRepository.findById(request.id)
      if (!job) throw new NotFoundError(`Job de exportacao nao encontrado: ${request.id}`)
      return job
    }
  )
}
