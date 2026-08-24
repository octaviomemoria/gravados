import { readFileSync } from 'node:fs'
import type { TranscriptionProvider, TranscriptionRequest, TranscriptionResult, TranscribedSegment } from '../transcription-provider'
import type { WhisperModelId } from '../../../../shared/schemas/settings.schema'
import { createScopedLogger } from '../../logger'

const logger = createScopedLogger('whisper-local-provider')

/** Um "chunk" cru devolvido pelo pipeline `automatic-speech-recognition` do
 * `@huggingface/transformers` quando chamado com `return_timestamps: true` - `timestamp[1]` pode
 * vir `null` no ULTIMO chunk se o audio terminar no meio de uma palavra (limitacao conhecida do
 * proprio modelo, nao um bug daqui) - `mapWhisperChunksToSegments` trata isso. */
export interface WhisperRawChunk {
  timestamp: [number, number | null]
  text: string
}

export interface WhisperTranscribeResult {
  text: string
  chunks?: WhisperRawChunk[]
}

export type WhisperTranscribeFn = (
  samples: Float32Array,
  options: { return_timestamps: true; chunk_length_s: number; language?: string }
) => Promise<WhisperTranscribeResult>

/** Cria (ou devolve, se ja carregado) a funcao de transcricao real pro modelo pedido - a UNICA
 * peca deste provedor que fala com `@huggingface/transformers`, isolada atras de um tipo simples
 * (`WhisperTranscribeFn`) pra que os testes possam injetar uma versao falsa sem baixar nenhum
 * modelo real nem depender de rede.
 *
 * `onDownloadProgress` (0-100) e opcional e so dispara enquanto pesos estao sendo baixados da rede
 * (refinamento pos-AI-002-LOCAL, ver `loadRealWhisperPipeline`) - um modelo ja cacheado em disco
 * nunca o chama, porque `pipeline()` nao emite eventos `progress` quando nao ha nada pra baixar. */
export type WhisperPipelineFactory = (
  repoId: string,
  onDownloadProgress?: (percent: number) => void,
  cacheDir?: string
) => Promise<WhisperTranscribeFn>

/** Mapeia o tamanho de modelo exposto na UI (Configuracoes) pro repositorio ONNX real no
 * Hugging Face Hub (conversao oficial da propria organizacao Xenova/HF, mesma usada pelo
 * `transformers.js`) - baixado sob demanda na primeira transcricao apos a troca, cacheado em
 * `env.cacheDir` (ver `app-context.ts`), nunca no repositorio git nem na pasta de gravacoes. */
const WHISPER_MODEL_REPO_IDS: Record<WhisperModelId, string> = {
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
  medium: 'Xenova/whisper-medium'
}

/**
 * Bug real encontrado testando transcricao no app EMPACOTADO: `cacheDir` PRECISA ser configurado
 * no MESMO `env` que `pipeline()` usa aqui embaixo, via este import DINAMICO - configura-lo num
 * `env` importado ESTATICAMENTE em outro arquivo (como `app-context.ts` fazia antes) nao tem
 * NENHUM efeito aqui. Motivo: `@huggingface/transformers` publica DOIS entry points Node
 * diferentes (`exports.node.require` vs `exports.node.import`, ver o `package.json` do pacote) -
 * um `import()` DINAMICO (como este) sempre resolve pra `dist/transformers.node.mjs`, enquanto um
 * `import` ESTATICO transpilado pra CJS pelo `electron-vite` (`require(...)`, confirmado no
 * `out/main/index.js` gerado) resolve pra `dist/transformers.node.cjs` - dois ARQUIVOS diferentes,
 * cada um com seu PROPRIO `env` (singleton do modulo, nunca compartilhado entre os dois). Mutar o
 * `env` do lado CJS nunca chegava a afetar o carregamento real do modelo, que sempre acontecia do
 * lado MJS - por isso a transcricao no app empacotado sempre tentava ler o `.onnx` do cache
 * PADRAO da biblioteca (dentro do proprio `app.asar`, um caminho que nem existe) em vez do cache
 * configurado (`userData/whisper-models`, ver `getWhisperModelsCacheDir`). Nunca reproduzido em
 * dev/testes porque nenhum deles roda de dentro de um `.asar` de verdade.
 */
async function loadRealWhisperPipeline(
  repoId: string,
  onDownloadProgress?: (percent: number) => void,
  cacheDir?: string
): Promise<WhisperTranscribeFn> {
  const { pipeline, env } = await import('@huggingface/transformers')
  if (cacheDir) {
    env.cacheDir = cacheDir
  }
  const transcriber = await pipeline('automatic-speech-recognition', repoId, {
    // `progress_total` agrega TODOS os arquivos do repositorio (pesos + tokenizer + config) num
    // unico percentual 0-100 - preferido a `progress` (que so cobre UM arquivo por vez e voltaria
    // pra 0% a cada novo arquivo, produzindo uma barra que parece "regredir"). So dispara quando ha
    // algo pra baixar de fato; um modelo ja cacheado em `env.cacheDir` nunca emite este evento.
    progress_callback: (info) => {
      if (info.status === 'progress_total') onDownloadProgress?.(Math.round(info.progress))
    }
  })
  return (samples, options) =>
    transcriber(samples, options) as unknown as Promise<WhisperTranscribeResult>
}

/** Parser MINIMO de WAV PCM16 mono/estereo - suficiente pro unico formato que este provedor
 * sempre recebe (`buildTranscriptionAudioExtractionArgs` sempre produz `pcm_s16le`/16kHz/mono),
 * nunca um decoder WAV genérico. `@huggingface/transformers` NAO consegue ler um caminho de
 * arquivo diretamente no processo main do Electron (erro real reproduzido antes de escrever este
 * modulo: "Unable to load audio from path/URL since `AudioContext` is not available" - a API Web
 * Audio so existe no processo renderer) - precisa receber as amostras ja decodificadas como
 * `Float32Array`, daí este parser em vez de passar o caminho adiante. Varre os chunks RIFF (nao
 * assume um cabecalho fixo de 44 bytes) ate achar `fmt ` (taxa/canais) e `data` (amostras) -
 * alguns encoders escrevem chunks extras (`LIST`, etc.) antes de `data`.
 */
export function readWavPcm16Mono(filePath: string): { sampleRate: number; samples: Float32Array } {
  const buffer = readFileSync(filePath)
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Arquivo nao e um WAV valido (cabecalho RIFF/WAVE ausente): ${filePath}`)
  }
  let offset = 12
  let dataOffset = -1
  let dataLength = 0
  let sampleRate = 0
  let numChannels = 1
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    if (chunkId === 'fmt ') {
      numChannels = buffer.readUInt16LE(offset + 10)
      sampleRate = buffer.readUInt32LE(offset + 12)
    } else if (chunkId === 'data') {
      dataOffset = offset + 8
      dataLength = chunkSize
    }
    // Chunks RIFF sao alinhados em bytes pares - um `chunkSize` impar tem 1 byte de padding.
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  if (dataOffset === -1 || sampleRate === 0) {
    throw new Error(`WAV sem chunk "fmt " ou "data" valido: ${filePath}`)
  }

  const totalSampleCount = Math.floor(dataLength / 2)
  if (numChannels === 1) {
    const samples = new Float32Array(totalSampleCount)
    for (let i = 0; i < totalSampleCount; i++) {
      samples[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768
    }
    return { sampleRate, samples }
  }
  // Defensivo - `buildTranscriptionAudioExtractionArgs` sempre pede `-ac 1`, mas um WAV externo
  // hipotetico (ex.: futuro upload manual) pode vir estereo; faz o downmix pra mono aqui em vez
  // de lancar, pra nao acoplar este parser a uma unica origem de arquivo.
  const frameCount = Math.floor(totalSampleCount / numChannels)
  const samples = new Float32Array(frameCount)
  for (let i = 0; i < frameCount; i++) {
    let sum = 0
    for (let channel = 0; channel < numChannels; channel++) {
      sum += buffer.readInt16LE(dataOffset + (i * numChannels + channel) * 2) / 32768
    }
    samples[i] = sum / numChannels
  }
  return { sampleRate, samples }
}

/** Traduz os chunks crus do pipeline (`timestamp` em SEGUNDOS, `[start, end | null]`) pro formato
 * de `TranscribedSegment` deste app (`startMs`/`endMs` inteiros) - funcao pura, testavel sem
 * precisar de audio nem modelo real. Descarta chunks de texto vazio (o modelo as vezes emite um
 * chunk final so com espaco/pontuacao residual). `totalDurationMs` cobre o `timestamp[1] === null`
 * do ULTIMO chunk (audio que termina no meio de uma palavra, ver `WhisperRawChunk`). */
export function mapWhisperChunksToSegments(
  chunks: readonly WhisperRawChunk[],
  totalDurationMs: number
): TranscribedSegment[] {
  const segments: TranscribedSegment[] = []
  for (const chunk of chunks) {
    const text = chunk.text.trim()
    if (text.length === 0) continue
    const startMs = Math.round(chunk.timestamp[0] * 1000)
    const endMs = chunk.timestamp[1] === null ? totalDurationMs : Math.round(chunk.timestamp[1] * 1000)
    segments.push({ startMs, endMs: Math.max(endMs, startMs), text })
  }
  return segments
}

/**
 * Refinamento pos-SEARCH-001 (Fase 5 "Transcrição") - transcrição REAL, 100% local, via Whisper
 * convertido pra ONNX (`@huggingface/transformers`). Diferente de um futuro `OPENAI` (AI-002,
 * ainda bloqueado esperando o usuário), este provedor nunca faz uma chamada de rede POR REUNIÃO -
 * só a PRIMEIRA transcrição com um modelo novo baixa os pesos (cacheados em `env.cacheDir`,
 * `app-context.ts`); dali em diante, tudo roda offline. Por isso não passa pelo mesmo gate de
 * consentimento/custo do `TranscriptionService` - ver decisão registrada no README.
 *
 * `getModelId` é uma função (não um valor fixo) porque o modelo escolhido em Configurações pode
 * mudar entre uma transcrição e outra - lido nesta hora, nunca cacheado no construtor.
 */
export class WhisperLocalProvider implements TranscriptionProvider {
  readonly id = 'WHISPER_LOCAL' as const

  private readonly pipelineCache = new Map<string, Promise<WhisperTranscribeFn>>()

  constructor(
    private readonly getModelId: () => WhisperModelId,
    private readonly pipelineFactory: WhisperPipelineFactory = loadRealWhisperPipeline,
    /** Ver comentario completo em `loadRealWhisperPipeline` sobre por que isto precisa ser
     * repassado ATE AQUI (e nao configurado de fora via `env` importado estaticamente). */
    private readonly whisperModelsCacheDir?: string
  ) {}

  async transcribe(
    request: TranscriptionRequest,
    onProgress: (percent: number) => void
  ): Promise<TranscriptionResult> {
    onProgress(5)
    const { sampleRate, samples } = readWavPcm16Mono(request.audioPath)
    logger.info(
      `Audio carregado para transcricao local (${sampleRate}Hz, ${samples.length} amostras)`
    )
    onProgress(20)

    const modelId = this.getModelId()
    const repoId = WHISPER_MODEL_REPO_IDS[modelId]
    let transcriberPromise = this.pipelineCache.get(repoId)
    if (!transcriberPromise) {
      // Mapeia o percentual de DOWNLOAD (0-100) pra faixa [20, 40) do progresso geral do job -
      // reservada pro carregamento do pipeline (leitura do audio ja usou ate 20, transcrever em si
      // usa de 40 a 90 abaixo). So dispara na PRIMEIRA transcricao com um modelo novo (ver
      // `loadRealWhisperPipeline`) - trocas de modelo subsequentes reusam `pipelineCache` e pulam
      // direto pra 40 sem eventos intermediarios, o mesmo comportamento de antes deste refinamento.
      transcriberPromise = this.pipelineFactory(
        repoId,
        (downloadPercent) => {
          onProgress(20 + Math.round((downloadPercent / 100) * 20))
        },
        this.whisperModelsCacheDir
      )
      this.pipelineCache.set(repoId, transcriberPromise)
    }
    const transcriber = await transcriberPromise
    onProgress(40)

    const result = await transcriber(samples, {
      return_timestamps: true,
      chunk_length_s: 30,
      language: request.language
    })
    onProgress(90)

    const totalDurationMs = Math.round((samples.length / sampleRate) * 1000)
    const segments = mapWhisperChunksToSegments(result.chunks ?? [], totalDurationMs)
    onProgress(100)

    return {
      model: repoId,
      language: request.language ?? null,
      segments
    }
  }
}
