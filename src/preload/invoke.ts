import { ipcRenderer } from 'electron'
import type { ZodType } from 'zod'
import type { IpcResult } from '../shared/contracts/channels'

/**
 * `.message` carrega um prefixo `[CODE]` legivel por maquina - achado empirico (nono incremento,
 * RF-042, confirmado com um teste E2E instrumentado): o `contextBridge` do Electron, ao propagar
 * uma excecao lancada aqui no preload ate o mundo isolado do renderer, clona o Error preservando
 * SO `message` (nem `.name` nem `.code`/`.metadata` sobrevivem - contrariando a suposicao inicial
 * de que `.name` seria preservado; o renderer via chegar sempre com `name: 'Error'`, generico,
 * mesmo apos `IpcError` seta-lo explicitamente aqui no preload). `.message`, por ser o UNICO campo
 * confirmado a sobreviver ao clone, e onde o `code` precisa viajar - `extractIpcErrorCode`
 * (`useRecordingSession.ts`) faz o parse inverso do prefixo do outro lado da fronteira. `code`/
 * `metadata` continuam existindo aqui tambem, uteis para quem consome este erro dentro do MESMO
 * realm (ex.: o proprio modulo de preload, testes).
 */
export class IpcError extends Error {
  readonly code: string
  readonly metadata?: Record<string, unknown>

  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(`[${code}] ${message}`)
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
