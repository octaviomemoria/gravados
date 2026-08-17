import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ZodType } from 'zod'
import type { IpcResult } from '../../shared/contracts/channels'
import { isDomainError } from '../../shared/types/domain-errors'
import { ERROR_CODES } from '../../shared/constants/error-codes'
import { createScopedLogger } from '../services/logger'

const logger = createScopedLogger('ipc')

export interface ChannelSchemas<TRequest, TResponse> {
  request: ZodType<TRequest>
  response: ZodType<TResponse>
}

export type IpcHandlerFn<TRequest, TResponse> = (
  request: TRequest,
  event: IpcMainInvokeEvent
) => Promise<TResponse> | TResponse

/**
 * Wrapper generico e validado por onde TODO canal IPC passa - "IPC sem validacao e proibido"
 * (12_DEVELOPMENT_STANDARDS.md). Nunca registrar `ipcMain.handle` fora deste wrapper.
 * Valida a entrada com Zod antes de chamar a logica de negocio, valida a saida em dev para pegar
 * bugs de handler cedo, mapeia `DomainError`s para o envelope IPC e nunca vaza stack cru ao
 * renderer em caso de erro desconhecido.
 */
export function registerHandler<TRequest, TResponse>(
  channel: string,
  schemas: ChannelSchemas<TRequest, TResponse>,
  handler: IpcHandlerFn<TRequest, TResponse>
): void {
  ipcMain.handle(channel, async (event, rawRequest: unknown): Promise<IpcResult<TResponse>> => {
    const parsedRequest = schemas.request.safeParse(rawRequest)
    if (!parsedRequest.success) {
      // Achado real investigando um relato do usuario ("erro de validacao ao iniciar gravacao")
      // sem NENHUM rastro no log - so o nome do canal era registrado, nunca o motivo. O resumo
      // (caminho do campo + mensagem do Zod, NUNCA o valor em si - pode conter dado sensivel do
      // usuario) vai na propria mensagem de log a partir de agora, tornando o PROXIMO caso
      // parecido diagnosticavel sem precisar reproduzir.
      const issuesSummary = parsedRequest.error.issues
        .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
        .join(' | ')
      logger.warn(`Requisicao IPC invalida - ${issuesSummary}`, { operation: channel })
      return {
        ok: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Requisicao invalida.',
          metadata: { issues: parsedRequest.error.issues }
        }
      }
    }

    try {
      const result = await handler(parsedRequest.data, event)

      if (process.env.NODE_ENV !== 'production') {
        const parsedResponse = schemas.response.safeParse(result)
        if (!parsedResponse.success) {
          logger.error('Handler IPC retornou payload fora do schema esperado', { operation: channel })
        }
      }

      return { ok: true, data: result }
    } catch (error) {
      if (isDomainError(error)) {
        logger.warn(error.message, { operation: channel, errorCode: error.code })
        return {
          ok: false,
          error: { code: error.code, message: error.message, metadata: error.metadata }
        }
      }
      logger.error('Erro inesperado em handler IPC', { operation: channel })
      return {
        ok: false,
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: 'Ocorreu um erro inesperado.' }
      }
    }
  })
}
