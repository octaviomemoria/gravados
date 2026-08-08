import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

type IpcListener = (event: unknown, payload: unknown) => unknown

const handlers = new Map<string, IpcListener>()

// Mocks focados: `ipc-handler.ts` importa `ipcMain` de 'electron' e `createScopedLogger` de
// '../services/logger'. Mockar o modulo de logger diretamente evita carregar `electron-log/main`
// de verdade (que por sua vez chama `electron.ipcMain.on(...)` no top-level do modulo - fora do
// escopo deste mock minimo de `ipcMain.handle`).
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: IpcListener) => {
      handlers.set(channel, listener)
    }
  }
}))

vi.mock('../../../src/main/services/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

const { registerHandler } = await import('../../../src/main/ipc/ipc-handler')
const { ValidationError: DomainValidationError } = await import('../../../src/shared/types/domain-errors')

describe('registerHandler', () => {
  beforeEach(() => {
    handlers.clear()
  })

  const requestSchema = z.object({ value: z.number() })
  const responseSchema = z.object({ doubled: z.number() })

  it('returns ok:false without calling the handler when the request is invalid', async () => {
    const handlerFn = vi.fn()
    registerHandler('test.channel.invalid', { request: requestSchema, response: responseSchema }, handlerFn)

    const listener = handlers.get('test.channel.invalid')
    const result = await listener?.({}, { value: 'not-a-number' })

    expect(handlerFn).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  it('returns ok:true with the handler result on success', async () => {
    registerHandler(
      'test.channel.ok',
      { request: requestSchema, response: responseSchema },
      async (request) => ({ doubled: request.value * 2 })
    )

    const listener = handlers.get('test.channel.ok')
    const result = await listener?.({}, { value: 21 })

    expect(result).toEqual({ ok: true, data: { doubled: 42 } })
  })

  it('maps a DomainError to a structured error envelope', async () => {
    registerHandler(
      'test.channel.domain-error',
      { request: requestSchema, response: responseSchema },
      async () => {
        throw new DomainValidationError('campo invalido')
      }
    )

    const listener = handlers.get('test.channel.domain-error')
    const result = await listener?.({}, { value: 1 })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'campo invalido' }
    })
  })

  it('maps an unknown thrown error to UNKNOWN_ERROR without leaking internals', async () => {
    registerHandler(
      'test.channel.unknown-error',
      { request: requestSchema, response: responseSchema },
      async () => {
        throw new Error('detalhe interno sensivel')
      }
    )

    const listener = handlers.get('test.channel.unknown-error')
    const result = await listener?.({}, { value: 1 })

    expect(result).toMatchObject({ ok: false, error: { code: 'UNKNOWN_ERROR' } })
    expect(JSON.stringify(result)).not.toContain('detalhe interno sensivel')
  })
})
