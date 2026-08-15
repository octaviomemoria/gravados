import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  StartExportRequestSchema,
  StartExportResponseSchema,
  ListExportJobsRequestSchema,
  ListExportJobsResponseSchema,
  GetExportStatusRequestSchema,
  GetExportStatusResponseSchema,
  CancelExportRequestSchema,
  CancelExportResponseSchema
} from '../../../shared/schemas/export.schema'
import { NotFoundError } from '../../../shared/types/domain-errors'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/**
 * EXP-003/004/008 (vigesimo quinto/oitavo incrementos - Fase 4). `start` delega ao `ExportService`
 * real (Timeline Compiler -> FFmpeg Plan -> Render Job, ver comentario la). `cancel` (EXP-008)
 * idem - mata o processo FFmpeg real e move o job pra `CANCELED`. `list`/`getStatus` inalterados
 * desde EXP-001 (leem a tabela `export_jobs` diretamente).
 */
export function registerExportHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.export.start,
    { request: StartExportRequestSchema, response: StartExportResponseSchema },
    async (request) =>
      context.exportService.startExport(request.editProjectId, request.target, request.rangeMs)
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

  registerHandler(
    IPC_CHANNELS.export.cancel,
    { request: CancelExportRequestSchema, response: CancelExportResponseSchema },
    async (request) => context.exportService.cancelExport(request.id)
  )
}
