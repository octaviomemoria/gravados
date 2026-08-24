import { describe, it, expect } from 'vitest'
import { sep } from 'node:path'
import { resolveFfmpegBinaries, unpackAsarPath } from '../../../src/main/media/ffmpeg/ffmpeg-locator'

/**
 * Bug real encontrado testando transcricao no app EMPACOTADO (ver comentario completo em
 * `ffmpeg-locator.ts`) - `ffmpeg-static`/`ffprobe-static` calculam o proprio caminho via
 * `__dirname` sem nenhuma nocao de `.asar`, produzindo um caminho que `spawn()` nunca consegue
 * executar de dentro do app empacotado. `unpackAsarPath` e a correcao, testada isoladamente aqui
 * sem precisar de um `.asar` real.
 */
describe('unpackAsarPath', () => {
  it('rewrites a path pointing inside app.asar to app.asar.unpacked', () => {
    const packaged = `C:${sep}Users${sep}octav${sep}AppData${sep}Local${sep}Programs${sep}Meeting Studio${sep}resources${sep}app.asar${sep}node_modules${sep}ffmpeg-static${sep}ffmpeg.exe`
    const result = unpackAsarPath(packaged)
    expect(result).toContain(`app.asar.unpacked${sep}node_modules${sep}ffmpeg-static${sep}ffmpeg.exe`)
    expect(result).not.toMatch(new RegExp(`app\\.asar\\${sep}node_modules`))
  })

  it('leaves a dev/test path untouched when it never went through an asar', () => {
    const devPath = `C:${sep}project${sep}node_modules${sep}ffmpeg-static${sep}ffmpeg.exe`
    expect(unpackAsarPath(devPath)).toBe(devPath)
  })

  it('returns null unchanged', () => {
    expect(unpackAsarPath(null)).toBeNull()
  })

  it('does not touch app.asar.unpacked paths that are already correct (idempotent)', () => {
    const alreadyUnpacked = `C:${sep}app${sep}resources${sep}app.asar.unpacked${sep}node_modules${sep}ffmpeg-static${sep}ffmpeg.exe`
    expect(unpackAsarPath(alreadyUnpacked)).toBe(alreadyUnpacked)
  })
})

describe('resolveFfmpegBinaries', () => {
  it('an explicit override always wins over env var and the -static package default', () => {
    const result = resolveFfmpegBinaries({ ffmpegPath: '/custom/ffmpeg', ffprobePath: '/custom/ffprobe' })
    expect(result).toEqual({ ffmpegPath: '/custom/ffmpeg', ffprobePath: '/custom/ffprobe' })
  })

  it('resolves to a real path in this (unpackaged) test environment', () => {
    const result = resolveFfmpegBinaries()
    expect(result.ffmpegPath).toBeTruthy()
    expect(result.ffprobePath).toBeTruthy()
    // Ambiente de teste nunca roda de dentro de um `.asar` - nenhum caminho aqui deveria conter
    // `app.asar` sem o `.unpacked` (confirmaria que `unpackAsarPath` nao mexeu em nada indevido).
    expect(result.ffmpegPath).not.toMatch(/app\.asar[/\\](?!unpacked)/)
  })
})
