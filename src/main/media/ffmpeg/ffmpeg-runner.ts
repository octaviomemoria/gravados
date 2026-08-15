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

/** EXP-009 - resultado de rodar o ffprobe (nao um arquivo de midia como `runFfmpegProcess` produz -
 * a "saida" aqui e o JSON que o proprio ffprobe escreve em stdout via `buildFfprobeArgs`). */
export interface FfprobeRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

/**
 * EXP-009 (vigesimo nono incremento - Fase 4, RF-035/RenderPlan doc §12 "Validation" - a etapa
 * final do pipeline `Edit Model → Timeline Compiler → FFmpeg Plan → Render Job → Validation →
 * Output`, unica ainda faltando desde EXP-003/004). Wrapper deliberadamente SEPARADO de
 * `runFfmpegProcess` (nao reaproveitado) - ffprobe nunca escreve num arquivo de midia, a saida
 * INTEIRA que importa e o JSON acumulado em stdout, diferente do progresso incremental
 * `-progress pipe:1` do FFmpeg (onde só a ULTIMA linha `out_time_us=` de cada chunk importa,
 * nunca o acumulado). Forcar os dois pelo mesmo wrapper exigiria uma flag pra alternar entre
 * "acumular tudo" vs "processar linha a linha e descartar", mais confuso que duas funcoes
 * pequenas e diretas.
 */
export function runFfprobeProcess(
  binaryPath: string,
  args: readonly string[]
): Promise<FfprobeRunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binaryPath, [...args], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      resolvePromise({ exitCode, stdout, stderr })
    })
  })
}

/** EXP-009 - resultado de validar a saida do ffprobe contra o arquivo exportado. `durationMs`
 * presente so quando `valid: true` - um arquivo invalido nunca tem uma duracao confiavel pra
 * reportar. */
export interface FfprobeValidationResult {
  valid: boolean
  reason?: string
  durationMs?: number
}

/**
 * EXP-009 - funcao PURA (nenhum spawn, nenhum I/O) que interpreta o JSON que `runFfprobeProcess`
 * capturou em stdout, testavel isoladamente com strings fabricadas em vez de precisar rodar um
 * ffprobe real pra cada caso de borda. Um arquivo exportado e considerado valido quando: (1) o
 * stdout e JSON valido (um ffprobe que morreu ou nunca rodou de verdade contra o arquivo nao
 * produz JSON); (2) existe pelo menos UM stream (`streams`, formato/vazio - um arquivo com zero
 * streams e zero bytes uteis, mesmo que o container em si seja tecnicamente bem formado); (3)
 * `format.duration` e um numero finito POSITIVO (um arquivo com duracao zero ou ausente indica um
 * encode que nunca produziu frames de verdade, mesmo com `exitCode 0` do FFmpeg - o cenario exato
 * que esta validacao existe pra pegar, ja que o `ExportService` ate agora so confiava no
 * `exitCode`).
 */
export function validateFfprobeOutput(stdout: string): FfprobeValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { valid: false, reason: 'saida do ffprobe nao e JSON valido' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, reason: 'saida do ffprobe nao e um objeto JSON' }
  }
  const data = parsed as { format?: { duration?: string }; streams?: unknown[] }
  if (!Array.isArray(data.streams) || data.streams.length === 0) {
    return { valid: false, reason: 'nenhum stream de audio/video encontrado no arquivo exportado' }
  }
  const durationSeconds = Number(data.format?.duration)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { valid: false, reason: 'arquivo exportado tem duracao zero, ausente ou invalida' }
  }
  return { valid: true, durationMs: Math.round(durationSeconds * 1000) }
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
