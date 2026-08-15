/**
 * EXP-002 (vigesimo quarto incremento - Fase 4). `ffprobe-static` nao publica tipos proprios nem
 * tem um pacote `@types/ffprobe-static` (verificado no npm). Declaracao minima cobrindo so o que
 * `ffmpeg-locator.ts` usa - o modulo real so exporta esse unico campo.
 */
declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string }
  export default ffprobeStatic
}
