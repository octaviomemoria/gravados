import { IPC_CHANNELS } from '../../../shared/contracts/channels'
import {
  RepairProjectRequestSchema,
  RepairProjectResponseSchema
} from '../../../shared/schemas/recovery.schema'
import { registerHandler } from '../ipc-handler'
import type { AppContext } from '../../app-context'

/** RECOV-003 (decimo incremento - reparo). Delega inteiramente ao `RecoveryService` - o handler
 * so faz a ponte de validacao/envelope IPC, mesmo padrao ja usado por todo domínio existente. */
export function registerRecoveryHandlers(context: AppContext): void {
  registerHandler(
    IPC_CHANNELS.recovery.repair,
    { request: RepairProjectRequestSchema, response: RepairProjectResponseSchema },
    async (request) => context.recoveryService.repair(request.id)
  )
}
