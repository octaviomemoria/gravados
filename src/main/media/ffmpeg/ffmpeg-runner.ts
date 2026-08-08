import { spawn } from 'node:child_process'

/**
 * Wrapper tipado para FFmpeg/FFprobe (AGENTS.md, 03_TECHNICAL_ARCHITECTURE.md secao 7,
 * 09_SECURITY_PRIVACY_COMPLIANCE.md). Cada argumento e um elemento separado do array, passado
 * diretamente a `spawn()` - nunca uma unica string montada por concatenacao com `exec()`.
 * Nesta fase nenhum binario e invocado de verdade (ver `ffmpeg-locator.ts`); apenas os
 * construtores de argumentos e o wrapper de execucao existem, prontos para a Fase 1/4.
 *
 * Nunca fazer isto: `exec("ffmpeg " + userInput)`.
 */
export interface FfmpegRunOptions {
  binaryPath: string
  args: readonly string[]
  cwd?: string
}

export interface FfmpegRunResult {
  exitCode: number | null
  stderr: string
}

export function buildFfprobeArgs(inputPath: string): string[] {
  return ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath]
}

export function runFfmpegProcess(options: FfmpegRunOptions): Promise<FfmpegRunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(options.binaryPath, [...options.args], {
      cwd: options.cwd,
      windowsHide: true
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      resolvePromise({ exitCode, stderr })
    })
  })
}
