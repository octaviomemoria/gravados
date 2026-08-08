import { ipcRenderer } from 'electron'
import type { ZodType } from 'zod'
import type { IpcResult } from '../shared/contracts/channels'

export class IpcError extends Error {
  readonly code: string
  readonly metadata?: Record<string, unknown>

  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(message)
    this.name = 'IpcError'
    this.code = code
    this.metadata = metadata
  }
}

export interface ChannelSchemas<TRequest, TResponse> {
  request: ZodType<TRequest>
  response: ZodType<TResponse>
}

/**
 * Unico ponto de chamada IPC no preload - a UI nunca importa `ipcRenderer` diretamente
 * (03_TECHNICAL_ARCHITECTURE.md: "nunca expor ipcRenderer generico diretamente"). Valida o
 * payload no cliente ANTES de enviar (defesa em profundidade - o main tambem valida de forma
 * independente) e valida a resposta de sucesso antes de devolve-la ao renderer.
 */
export async function invokeChannel<TRequest, TResponse>(
  channel: string,
  schemas: ChannelSchemas<TRequest, TResponse>,
  request: TRequest
): Promise<TResponse> {
  const parsedRequest = schemas.request.parse(request)
  const result = (await ipcRenderer.invoke(channel, parsedRequest)) as IpcResult<TResponse>

  if (!result.ok) {
    throw new IpcError(result.error.code, result.error.message, result.error.metadata)
  }

  return schemas.response.parse(result.data)
}
