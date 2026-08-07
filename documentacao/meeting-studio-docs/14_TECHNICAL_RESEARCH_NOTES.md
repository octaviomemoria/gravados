# Notas de Pesquisa Técnica — Agosto de 2026

Este arquivo registra pontos externos que devem ser revalidados quando dependências forem atualizadas.

## Electron desktop capture

A documentação oficial do Electron descreve `desktopCapturer` para obter fontes de tela/janela usadas em captura de mídia.

A API também demonstra `setDisplayMediaRequestHandler` e seleção de áudio `loopback`.

Fonte:
https://www.electronjs.org/docs/latest/api/desktop-capturer/

## Permissões Electron

A sessão Electron possui handlers para permissões, incluindo:

- `display-capture`;
- `media`.

Fonte:
https://www.electronjs.org/docs/latest/api/session

## macOS

A documentação atual registra consentimento específico para screen capture e requisitos adicionais em versões recentes do macOS para captura de áudio via desktopCapturer.

O MVP permanece Windows-first para reduzir variabilidade.

Fonte:
https://www.electronjs.org/docs/latest/api/system-preferences

## FFmpeg segmenter

O FFmpeg possui muxer `segment` capaz de gerar arquivos separados por duração e listas de segmentos.

Para o Meeting Studio, isso é útil principalmente em pipelines de processamento/exportação. Durante captura via browser MediaRecorder, a estratégia de persistência/rotação poderá ser controlada pelo próprio recording engine.

Fonte:
https://ffmpeg.org/ffmpeg-formats.html

## Precisão de cortes

A documentação do segment muxer alerta que divisões de vídeo podem depender de keyframes para precisão.

O editor não deve assumir que todo corte com stream copy será frame-accurate. Quando necessário, renderizar/re-encode.

## OpenAI transcrição

A Audio API oferece endpoint de transcrição e modelos incluindo opções com timestamps e diarização.

A integração ficará atrás de `TranscriptionProvider`.

Fonte:
https://platform.openai.com/docs/api-reference/audio

## Regra de atualização

Antes de atualizar Electron, Chromium ou FFmpeg:

1. verificar breaking changes;
2. testar screen capture;
3. testar system audio;
4. testar permissões;
5. executar soak recording;
6. executar recovery;
7. validar export.
