import { spawn } from 'node:child_process'

/**
 * Wrapper tipado para FFmpeg/FFprobe (AGENTS.md, 03_TECHNICAL_ARCHITECTURE.md secao 7,
 * 09_SECURITY_PRIVACY_COMPLIANCE.md). Cada argumento e um elemento separado do array, passado
 * diretamente a `spawn()` - nunca uma unica string montada por concatenacao com `exec()`.
 *
 * EXP-002 (vigesimo quarto incremento - Fase 4) - binario real conectado (`ffmpeg-locator.ts`,
 * `ffmpeg-static`/`ffprobe-static`). `runFfmpegProcess` ganhou progresso (EXP-007) e cancelamento
 * (EXP-008) nesta mesma passada - os tres sao a MESMA infraestrutura de processo (spawn + stdout/
 * stderr + kill), faz sentido entregar juntos em vez de retrabalhar a assinatura tres vezes.
 *
 * Nunca fazer isto: `exec("ffmpeg " + userInput)`.
 */
export interface FfmpegRunOptions {
  binaryPath: string
  args: readonly string[]
  cwd?: string
  /** EXP-007 - chamado a cada linha `out_time_us=...` que o FFmpeg escreve em stdout quando os
   * `args` incluem `-progress pipe:1` (o CHAMADOR decide incluir essa flag - este wrapper nao
   * injeta nada nos argumentos, mantendo `args` como a UNICA fonte de verdade do comando real
   * executado, auditavel). `totalDurationMs` converte o tempo decorrido em porcentagem 0-100;
   * omitido = sem calculo de progresso (chunks de stdout ainda sao ignorados sem erro). */
  onProgress?: (percent: number) => void
  totalDurationMs?: number
}

export interface FfmpegRunResult {
  exitCode: number | null
  stderr: string
  /** EXP-008 - `true` quando o processo foi encerrado via `cancel()` (chamador pediu, nao um erro
   * do FFmpeg em si) - permite ao `ExportService` (incremento futuro) distinguir "usuario
   * cancelou" de "FFmpeg falhou", cada um com tratamento de job (`CANCELED` vs `FAILED`)
   * diferente mesmo com `exitCode` frequentemente identico (processo morto por sinal). */
  canceled: boolean
}

/** EXP-008 - alca de controle devolvida por `runFfmpegProcess`, junto da promise do resultado
 * final. `cancel()` e seguro chamar mais de uma vez ou depois do processo ja ter terminado (sem
 * lancar) - `child.kill()` em cima de um processo ja morto e um no-op do Node. */
export interface FfmpegProcessHandle {
  result: Promise<FfmpegRunResult>
  cancel: () => void
}

export function buildFfprobeArgs(inputPath: string): string[] {
  return ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath]
}

/**
 * EXP-007 - extrai `out_time_us` (microssegundos, nome inequivoco - ao contrario de
 * `out_time_ms`, que por uma excentricidade historica do proprio FFmpeg tambem vem em
 * MICROssegundos apesar do nome) de uma linha `-progress pipe:1`. Retorna `null` pra qualquer
 * linha que nao seja essa chave especifica (`frame=`, `fps=`, `progress=continue`, etc. - o
 * formato e uma sequencia de `chave=valor`, uma por linha, e so uma delas importa aqui).
 */
export function parseFfmpegProgressLine(line: string): number | null {
  const match = /^out_time_us=(-?\d+)$/.exec(line.trim())
  if (!match) return null
  const microseconds = Number(match[1])
  if (!Number.isFinite(microseconds) || microseconds < 0) return null
  return microseconds / 1000
}

/** EXP-007 - `outTimeMs`/`totalDurationMs` podem produzir >100% por arredondamento no ultimo
 * chunk (o FFmpeg as vezes reporta um `out_time` levemente alem da duracao real do input) ou
 * `totalDurationMs` igual a zero por defensividade (video sem duracao detectavel) - sempre
 * clampado a `[0, 100]`. */
export function computeExportProgress(outTimeMs: number, totalDurationMs: number): number {
  if (totalDurationMs <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((outTimeMs / totalDurationMs) * 100)))
}

export function runFfmpegProcess(options: FfmpegRunOptions): FfmpegProcessHandle {
  let canceled = false
  const child = spawn(options.binaryPath, [...options.args], {
    cwd: options.cwd,
    windowsHide: true
  })

  const result = new Promise<FfmpegRunResult>((resolvePromise, reject) => {
    let stderr = ''
    let stdoutTail = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    // EXP-007 - stdout so carrega progresso quando o chamador pediu `-progress pipe:1` nos
    // proprios `args`; sem essa flag o FFmpeg nao escreve nada ali (saida real vai pro arquivo de
    // destino, nunca pra stdout neste app). Chunks podem cortar uma linha ao meio - acumula um
    // "resto" (`stdoutTail`) entre eventos `data`, processando so linhas completas.
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!options.onProgress) return
      stdoutTail += chunk.toString('utf-8')
      const lines = stdoutTail.split('\n')
      stdoutTail = lines.pop() ?? ''
      for (const line of lines) {
        const outTimeMs = parseFfmpegProgressLine(line)
        if (outTimeMs === null) continue
        options.onProgress(computeExportProgress(outTimeMs, options.totalDurationMs ?? 0))
      }
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      resolvePromise({ exitCode, stderr, canceled })
    })
  })

  return {
    result,
    cancel: () => {
      canceled = true
      child.kill()
    }
  }
}
