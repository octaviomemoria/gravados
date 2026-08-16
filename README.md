# Meeting Studio

> Nome de trabalho — pode mudar sem impacto arquitetural (`00_README.md`).

Aplicativo desktop para gravação, edição, organização e análise inteligente de reuniões.
Local-first, não destrutivo, recuperável. Windows-first no MVP, sem dependências que impeçam
suporte futuro a macOS.

A **Fase 0 — Bootstrap e Fundação Técnica** está completa: fundação arquitetural
(Electron/React/TypeScript/Vite, IPC tipado e validado, SQLite+Drizzle, segurança de processo,
sistema de jobs, logging, testes/CI). A **Fase 1 — Recording Core** está completa: REC-001 a
REC-004 (dispositivos + preview) e um pipeline de captura real com as **quatro fontes simultâneas
do MVP** (tela, câmera, microfone e áudio do sistema, trilhas independentes) funcionam de ponta a
ponta (gravar → persistir em disco continuamente → finalizar), com **segmentação automática por
tempo/tamanho**, **pausar/retomar** (RF-010), **marcadores** (RF-016) e **monitor de espaço em
disco** (RF-042) implementados. Ver
[Dispositivos e preview](#dispositivos-e-preview-fase-1),
[Captura real de microfone e câmera](#captura-real-de-microfone-e-câmera-fase-1),
[Segmentação por tempo/tamanho](#segmentação-por-tempotamanho-fase-1),
[Pausar/retomar](#pausarretomar-fase-1), [Marcadores](#marcadores-fase-1) e
[Monitor de espaço em disco](#monitor-de-espaço-em-disco-fase-1). A **Fase 2 — Recovery + Library**
está completa: detecção e reparo de gravações interrompidas por um encerramento abrupto
(RECOV-002/RECOV-003), e detalhes/renomear/excluir na Biblioteca (LIB-002/004/006) funcionam de
ponta a ponta - ver [Recuperação de gravações incompletas](#recuperação-de-gravações-incompletas-fase-2)
e [Biblioteca: detalhes, renomear, excluir](#biblioteca-detalhes-renomear-excluir-fase-2). A
**Fase 3 — Editor MVP** está completa: criar/abrir um projeto de edição vinculado a uma
gravação concluída (EDIT-001), a timeline compilada somente-leitura (EDIT-002), o preview
completo com playhead sincronizado e reprodução multi-trilha (EDIT-003, partes 1 e 2), corte/
split/remover-intervalo (EDIT-004/005/006), desfazer/refazer (EDIT-007), ganho/mudo por trilha
(EDIT-008), fade in/out por trilha (EDIT-009), visibilidade/posição/tamanho de câmera (EDIT-010,
overlay picture-in-picture sobre a trilha de fundo), layout da composição (EDIT-011, PiP/
lado-a-lado/só-tela/só-câmera) e salvamento automático (EDIT-012, toda mutação já persiste de
forma atômica no instante em que acontece - nunca há um botão "Salvar") funcionam de ponta a
ponta - ver
[Editor: criar e abrir projeto de edição](#editor-criar-e-abrir-projeto-de-edição-fase-3),
[Timeline: dados e visualização somente-leitura](#timeline-dados-e-visualização-somente-leitura-fase-3),
[Preview: protocolo de mídia local + player mínimo](#preview-protocolo-de-mídia-local--player-mínimo-fase-3),
[Playhead sincronizado e reprodução multi-trilha](#playhead-sincronizado-e-reprodução-multi-trilha-fase-3),
[Corte, split e remover intervalo](#corte-split-e-remover-intervalo-fase-3),
[Desfazer e refazer](#desfazer-e-refazer-fase-3),
[Ganho e mudo por trilha](#ganho-e-mudo-por-trilha-fase-3),
[Fade in/out por trilha](#fade-inout-por-trilha-fase-3),
[Transformação de câmera (PiP)](#transformação-de-câmera-pip-fase-3),
[Layout da composição](#layout-da-composição-fase-3) e
[Autosave e indicador de salvamento](#autosave-e-indicador-de-salvamento-fase-3). A
**Fase 4 — Export está completa** (marcando o **Marco MVP** do roadmap): `ffmpeg-static`/
`ffprobe-static` instalados, o "Timeline Compiler" (EXP-001/002 - traduz a timeline editada num
render plan estruturado), o "FFmpeg Plan" + "Render Job" de vídeo (EXP-003/004 - `export.start`
produz um MP4 720p/1080p REAL em disco), áudio-only (EXP-005 - M4A/MP3/WAV, RF-033), exportação de
intervalo selecionado (EXP-006, RF-034, reusa a seleção já existente do editor), cancelamento real
de exportação (EXP-007/008, RF-035 - mata o processo FFmpeg de verdade, não só muda um status), a
etapa "Validation" da doc (EXP-009 - confirma via ffprobe REAL que o arquivo escrito é utilizável
antes de marcar o job `COMPLETED`, não só confia no `exitCode` do FFmpeg) e agora PiP/lado-a-lado
reais no arquivo exportado (EXP-004b - o mesmo layout que o editor mostra no preview, composto de
verdade via `overlay`/`hstack` do FFmpeg), tudo com botões de exportação na tela do editor,
funcionam de ponta a ponta - ver
[Render plan e wrapper FFmpeg real](#render-plan-e-wrapper-ffmpeg-real-fase-4),
[Export real: comando FFmpeg + ExportService](#export-real-comando-ffmpeg--exportservice-fase-4),
[Exportação só de áudio](#exportação-só-de-áudio---m4ampp3wav-fase-4),
[Exportação de intervalo selecionado](#exportação-de-intervalo-selecionado-fase-4),
[Progresso e cancelamento de exportação](#progresso-e-cancelamento-de-exportação-fase-4),
[Validação do arquivo exportado via ffprobe](#validação-do-arquivo-exportado-via-ffprobe-fase-4) e
[PiP e lado-a-lado reais na exportação](#pip-e-lado-a-lado-reais-na-exportação-fase-4). A
**Fase 5 — Transcrição** começou: AI-001 (abstração de provedor - schema/repositórios/job
assíncrono/canais IPC completos, `transcription.start` sempre enfileira com sucesso, mas o job
sempre termina `FAILED` nesta etapa porque nenhum provedor real está conectado ainda - envolve
custo/consentimento do usuário, ver
[Transcrição: abstração de provedor](#transcrição-abstração-de-provedor-fase-5)) é o primeiro
incremento pós-Marco MVP.

A especificação funcional/técnica completa vive em [`documentacao/meeting-studio-docs/`](documentacao/meeting-studio-docs/);
este README documenta apenas a fundação de código já implementada.

## Requisitos

- **Node.js** ≥ 22 (testado com 22.20.0)
- **pnpm** ≥ 11
- **Windows 10/11** (alvo do MVP) — o código evita chamadas Windows-only fora do necessário
- No Windows, `better-sqlite3` usa binários pré-compilados N-API (ver [Decisões de arquitetura](#decisões-de-arquitetura)); não é necessário Visual Studio Build Tools em uso normal

## Instalação

```bash
pnpm install
```

O `pnpm install` baixa automaticamente o binário do Electron (via `electron/install.js`). Se, por
qualquer motivo, o binário não for baixado (ambiente com scripts de build bloqueados), rode:

```bash
node node_modules/electron/install.js
```

## Scripts

```bash
pnpm dev          # electron-vite dev (hot reload de main/preload/renderer)
pnpm start        # electron-vite preview (roda o build de out/ sem recompilar)
pnpm build        # electron-vite build -> out/main, out/preload, out/renderer
pnpm lint         # eslint . --max-warnings=0
pnpm lint:fix
pnpm format       # prettier --write .
pnpm typecheck    # tsc -b (main+preload+shared, renderer, testes) — três projetos TS compostos
pnpm test         # vitest run (unit + integração, ambiente node/jsdom conforme o arquivo)
pnpm test:watch
pnpm test:e2e     # playwright test — requer `pnpm build` rodado antes (ver abaixo)
pnpm db:generate  # drizzle-kit generate — gera uma nova migration a partir do schema
pnpm db:push      # drizzle-kit push — SOMENTE uso manual em dev, nunca usado pelo app/CI
pnpm db:studio    # drizzle-kit studio — inspeção visual do banco, uso manual em dev
pnpm rebuild:native  # electron-rebuild --only=better-sqlite3 — fallback de diagnóstico, não é necessário em uso normal (ver decisões)
```

### Testes E2E

`pnpm test:e2e` roda contra o **build real** (`out/main/index.js`), não contra o servidor de dev.
Rode `pnpm build` antes (a mesma ordem usada na validação final: lint → typecheck → test → build →
test:e2e). Se `out/` não existir, os testes E2E são pulados automaticamente com uma mensagem clara
em vez de falhar.

## Arquitetura

```text
Renderer (React + UI + Preview + Timeline)
   │ contextBridge / IPC (window.meetingStudio.*)
Main (lifecycle, devices, files, permissions, DB)
   ├── Media Worker (persistência)      [esqueleto - Fase 1]
   └── Export Worker (FFmpeg)           [esqueleto - Fase 4]
        │
Local Files + SQLite + Manifests
```

- **Main** (`src/main/`): lifecycle, janelas, permissões, filesystem, IPC, banco, jobs.
- **Preload** (`src/preload/`): API mínima e tipada exposta via `contextBridge`. Nunca expõe
  `ipcRenderer` genérico.
- **Renderer** (`src/renderer/`): UI React. Nunca acessa fs/processos/shell/FFmpeg/DB/Node
  diretamente — tudo passa por `window.meetingStudio.*`.
- **Shared** (`src/shared/`): contratos IPC, schemas Zod, tipos e constantes — a única pasta
  importada tanto pelo projeto TS de main/preload quanto pelo de renderer.

### Scaffolding

`electron-vite` orquestra os três builds (main/preload/renderer) a partir de um único
`electron.vite.config.ts`. `externalizeDepsPlugin()` mantém dependências nativas (`better-sqlite3`)
fora do bundle de main/preload — essencial, senão o binário nativo quebra.

### IPC

- `shared/contracts/channels.ts` — nomes de canal por domínio (`project.*`, `settings.*`,
  `recording.*`, `export.*`, `system.*`) + envelope `IpcResult<T>`.
- `shared/schemas/*.schema.ts` — par Zod `{request, response}` por canal.
- `main/ipc/ipc-handler.ts` — `registerHandler()` genérico: valida entrada, chama a lógica, valida
  saída em dev, mapeia `DomainError`/erros desconhecidos para o envelope. **Nenhum canal é
  registrado fora deste wrapper.**
- `preload/invoke.ts` — `invokeChannel()` espelha a validação no lado do renderer antes de enviar
  (defesa em profundidade).
- `window.meetingStudio.{project,library,settings,recording,export,system}` — API exposta,
  conforme o exemplo conceitual de `03_TECHNICAL_ARCHITECTURE.md`.

### Banco de dados

SQLite (`better-sqlite3`) + Drizzle ORM. 8 tabelas (`src/main/database/schema/`):
`projects`, `tracks`, `segments`, `markers`, `edit_projects`, `edit_operations`, `export_jobs`,
`settings` — espelhando `06_DATA_MODEL.md`. Migrations versionadas em
`src/main/database/migrations/` (geradas por `pnpm db:generate`, commitadas, aplicadas no boot via
`runMigrations()` — nunca alteradas manualmente).

### Filesystem

`src/main/media/project-filesystem.ts` constrói a árvore exata de `03_TECHNICAL_ARCHITECTURE.md`
(`MeetingStudio/projects/<id>/manifest.json`, `source/{screen,camera,microphone,system-audio}/`,
`proxies/`, `thumbnails/`, `exports/`, `recovery/`) e escreve `manifest.json` atomicamente
(temp file → flush → rename). Nesta fase, apenas a árvore de pastas e o manifest inicial são
criados ao criar um projeto — nenhum arquivo de mídia real é gravado.

### Jobs

`src/main/jobs/job-runner.ts` — runner genérico em memória (`QUEUED → RUNNING → COMPLETED|FAILED|CANCELED`).
`src/main/jobs/export-job-store.ts` — única implementação de persistência concreta, sobre a tabela
`export_jobs` (ver [Decisões de arquitetura](#decisões-de-arquitetura)).

### Segurança

- `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- CSP aplicada via `session.webRequest.onHeadersReceived` (não `<meta>`) — restritiva em produção,
  levemente relaxada em dev para HMR do Vite.
- `will-navigate`/`setWindowOpenHandler` bloqueiam navegação/popups fora da origem do app.
- `app.requestSingleInstanceLock()` — evita duas instâncias disputando o mesmo SQLite.
- Todo caminho de filesystem é validado (`assertValidProjectId`, `assertPathWithinBoundary`) antes
  de qualquer operação.
- FFmpeg (esqueleto): sempre `spawn(binary, args)`, nunca `exec` com concatenação de string.

### Dispositivos e preview (Fase 1)

Primeiro incremento da Fase 1 — Recording Core (RF-002/RF-003/RF-004/RF-008, MVP-AC-001):

- **Telas/janelas** (`devices.listScreens`): `desktopCapturer.getSources()` só existe no processo
  main; retorna `{id, name, kind, thumbnailDataUrl}` via IPC. O `id` (`screen:ZZ:0`/`window:XX:YY`)
  fica pronto para ser usado como `chromeMediaSourceId` quando a captura real for implementada.
- **Câmeras/microfones**: enumerados no renderer via `navigator.mediaDevices.enumerateDevices()`
  (API web padrão, sem IPC). Rótulos só vêm preenchidos após permissão concedida —
  `session.setPermissionRequestHandler`/`setPermissionCheckHandler` (`main/security/permissions.ts`)
  concedem automaticamente apenas `'media'`, escopados à própria janela do app; qualquer outra
  permissão é negada por padrão.
- **Preview**: vídeo ao vivo da câmera (`getUserMedia` + `<video>`) e medidor de nível do
  microfone (Web Audio `AnalyserNode`, RMS normalizado — `calculateAudioLevel`, testado
  isoladamente). Telas mostram apenas a miniatura estática do `desktopCapturer` (não abrem uma
  captura de tela ao vivo só para a etapa de seleção — decisão deliberada de custo/benefício).
- Falha de permissão/dispositivo nunca trava a UI (MVP-AC-014): mostra mensagem amigável.
- `RecordingSetupPage` (rota "Nova gravação") cobre seleção + preview + captura (ver abaixo).
  Qualidade, segmentação e layout ainda não estão na tela de setup.

### Captura real de microfone e câmera (Fase 1)

Terceiro incremento da Fase 1 — pipeline completo de gravação com **múltiplas trilhas
simultâneas**: microfone e câmera, independentes (RF-006 "webcam + áudio", RF-007 "trilhas
independentes"). Começou por microfone sozinho (fonte mais simples, sem `chromeMediaSourceId`) para
validar a arquitetura de streaming/persistência antes de generalizar para N trilhas; tela fica para
o próximo incremento (exige a API não-padrão do Chromium `chromeMediaSourceId`).

- **Fluxo**: `project.create` (RF-001) → `recording.start({projectId, trackTypes})` cria uma
  trilha por tipo pedido (`MICROPHONE`/`CAMERA`), transiciona a `RecordingStateMachine`
  `IDLE→PREPARING→RECORDING` → um `MediaRecorder` por fonte no renderer emite chunks a cada ~1s →
  cada chunk vai para `recording.appendChunk` marcado com o `trackId` da sua fonte e é escrito no
  arquivo daquela trilha imediatamente (nunca acumulado em memória - RF-014) →
  `recording.stop({projectId})` fecha e finaliza TODAS as trilhas ativas, atualiza
  `projects`/`manifest.json` e transiciona `STOPPING→FINALIZING→COMPLETED` (depois reseta para
  `IDLE`, liberando uma nova sessão).
- **Protocolo de chunk binário** (`recording.appendChunk`): payload `{trackId, sequence, mimeType,
  data: Uint8Array}` validado por Zod (`z.instanceof(Uint8Array)`) - a serialização estruturada do
  Electron transporta os bytes nativamente, sem round-trip via base64/JSON. Chunks fora de ordem
  ou duplicados são descartados (`sequence <= lastSequence`) para nunca corromper o arquivo. O
  renderer mantém uma fila de envio estritamente sequencial POR TRILHA (`useRecordingSession`) -
  a ordem só precisa ser garantida dentro de cada trilha (cada uma vira um arquivo separado), não
  entre trilhas diferentes.
- **`RecordingSessionManager`** (`main/recording/`): dona da única sessão ativa por vez, com um
  `Map<trackId, TrackSession>` interno; abre o arquivo/cria a linha de segmento de cada trilha só
  no PRIMEIRO chunk dela (quando o `mimeType` real já é conhecido); qualquer falha durante
  `start`/`stop` libera a sessão e reseta a máquina de estados para `IDLE`, nunca deixando o
  sistema preso sem possibilidade de nova tentativa (AGENTS.md: confiabilidade).
- **Indicador de gravação** (RF-043): `RecordingControls` mostra `REC HH:MM:SS` enquanto ativo.
- Testado de ponta a ponta em `tests/e2e/recording.spec.ts` usando os dispositivos de áudio/vídeo
  sintéticos do Chromium (`--use-fake-device-for-media-stream`, habilitado só via
  `MEETING_STUDIO_E2E_FAKE_MEDIA=1`) - grava as duas trilhas de verdade, sem hardware, e verifica
  os dois arquivos finais no disco via `expect.poll` (espera a condição real - arquivo com bytes -
  em vez de um tempo fixo, mais robusto sob carga de sistema variável).

### Captura real de tela (Fase 1)

Quarto incremento da Fase 1 — terceira fonte simultânea (RF-002), completando o trio tela +
câmera + microfone previsto para o MVP (cada combinação testada em par, ver "Testes" abaixo):

- **Aquisição sob demanda**: diferente de câmera/microfone (que já chegam como streams contínuas
  de preview escolhidas em `RecordingSetupPage`), a stream de tela só é adquirida no exato momento
  de `recording.start` — não há preview de tela ao vivo (a etapa de seleção mostra apenas a
  miniatura estática do `desktopCapturer`, decisão já registrada no incremento anterior).
  `acquireScreenStream(sourceId)` usa `chromeMediaSourceId`/`mandatory: {chromeMediaSource:
  'desktop'}`, extensões não-padrão do Chromium para `getUserMedia` sem tipos DOM próprios
  (interface `DesktopCaptureConstraints` + cast local).
- **`RecordingSessionManager`**: `SCREEN` é só mais uma entrada em `TRACK_TYPE_INFO` — a estrutura
  em `Map<trackId, TrackSession>` introduzida no incremento anterior já era genérica o suficiente
  para um terceiro tipo de trilha sem alterações estruturais.
- Testado de ponta a ponta em `tests/e2e/recording.spec.ts` (cenário "screen + microphone") e via
  teste sintético de 3 trilhas simultâneas em `recording-session-manager.test.ts`.

### Captura real de áudio do sistema (Fase 1)

Quinto incremento da Fase 1 — quarta fonte simultânea (RF-005), completando as quatro fontes do
MVP (tela + câmera + microfone + áudio do sistema):

- **"Quando suportado pela plataforma" (RF-005)**: diferente das demais fontes, uma falha ao
  adquirir a stream de áudio do sistema **não aborta a gravação inteira** — só essa trilha fica de
  fora, as demais continuam normalmente (`RecordingSessionManager.stop()` já finalizava
  graciosamente uma trilha sem nenhum chunk desde o incremento anterior; esse caminho só não era
  exercitado ainda — ver teste "gracefully finalizes a track that never received any chunk").
- **Achado empírico registrado**: pedir *apenas* áudio (`video: false`) com
  `chromeMediaSource: 'desktop'` **derruba o processo de renderer** no Electron/Chromium testado
  aqui (confirmado via E2E: "Page crashed", não uma Promise rejeitada — o `try/catch` de
  degradação graciosa não pega esse caso). A API exige uma captura de vídeo emparelhada
  (`chromeMediaSourceId` de uma fonte `kind: 'screen'` — `window` não suporta áudio loopback),
  mesmo que o vídeo não seja usado. `acquireSystemAudioStream` pede os dois e descarta
  imediatamente as tracks de vídeo, mantendo só o áudio.
- **UI**: um simples checkbox "Áudio do sistema" (não há dispositivo/id para escolher — é a saída
  inteira do sistema), diferente dos pickers de câmera/tela. A fonte de vídeo "portadora"
  (qualquer `kind: 'screen'` disponível) é escolhida automaticamente, independente de qual tela o
  usuário escolheu gravar como vídeo (`selectedScreenId` pode até ser nenhuma).
- Testado de ponta a ponta em `tests/e2e/recording.spec.ts` (cenário "system audio + microphone")
  e via testes sintéticos em `recording-session-manager.test.ts` (4 trilhas simultâneas + o caso
  de trilha sem nenhum chunk).

### Segmentação por tempo/tamanho (Fase 1)

Sexto incremento da Fase 1 — RF-012/RF-013: cada trilha rotaciona para um novo arquivo
(`camera_000001.webm` → `camera_000002.webm` → ...) ao cruzar um limite configurável de tempo OU
tamanho, sem interromper a gravação. Configuração global em **Configurações** (reaproveita o
schema `recordingPresets` já existente desde a Fase 0, até então sem nenhuma UI).

- **Restrição técnica central**: um arquivo WebM/Matroska só é válido se produzido por um ciclo
  completo `MediaRecorder.start()`…`.stop()` — não dá para simplesmente continuar escrevendo bytes
  num arquivo novo no meio do stream. Rotacionar significa parar o `MediaRecorder` atual da
  trilha e iniciar um **novo** sobre a MESMA `MediaStream` (parar um recorder não para as tracks
  do stream) — `createTrackRecorderState` em `useRecordingSession.ts` é reaproveitada tanto na
  criação inicial quanto em cada rotação.
- **Sem canal IPC novo para rotação**: `recording.appendChunk` ganhou um campo `segmentIndex` — o
  renderer decide QUANDO rotacionar (compara `totalBytes`, já devolvido por `appendChunk`, contra
  `sizeSegmentationMb`; um `setTimeout` por trilha contra `timeSegmentationMinutes`) e só sinaliza
  a decisão enviando um índice maior no próximo chunk. O main reage à mudança de índice reaproveitando
  a mesma lógica de criação preguiçosa que já existia para o primeiro segmento.
- **Dois bugs de concorrência corrigidos como parte deste incremento** (não eram visíveis com um
  segmento só por trilha): `durationMs` de cada segmento agora é calculado a partir do início
  DAQUELE segmento (antes usava o início da sessão inteira); e `RecordingSessionManager.stop()`
  marca a trilha como `stopped` como a **primeira ação**, antes de qualquer `await`, fechando uma
  janela onde um `appendChunk` já enfileirado no mutex da trilha poderia reabrir um segmento numa
  gravação já finalizada. O mesmo padrão (`stoppedRef`, verificado de forma síncrona) existe no
  lado renderer.
- **Bug real encontrado só no E2E (não nos testes sintéticos) e corrigido**: `MediaRecorder.stop()`
  emite um último chunk de "flush" antes do evento `'stop'` — esse chunk final ainda pertence ao
  segmento antigo, mas seu `totalBytes` continua acima do limite configurado (bytes só crescem),
  então disparava uma **segunda rotação redundante** logo após a primeira, que apagava o segmento
  recém-criado quase instantaneamente e pulava direto para o próximo índice (`..._000002.webm`
  nunca chegava a existir). Diagnosticado capturando `page.on('console')` numa execução isolada.
  Corrigido com uma guarda (`rotationInFlightRef` em `useRecordingSession.ts`) que impede
  enfileirar uma nova rotação enquanto uma já está em andamento para a trilha.
- Testado de ponta a ponta em `tests/e2e/recording.spec.ts` (cenário "segmentation", limite de 1
  MB — o mínimo permitido pelo schema — numa trilha de câmera) e via testes sintéticos em
  `recording-session-manager.test.ts` (rotação mid-sessão, manifest com múltiplos segmentos,
  chunk de segmento obsoleto descartado, `stop()` correndo em paralelo com um `appendChunk`
  tardio). A taxa de bytes/segundo da câmera sintética mostrou-se muito variável sob a carga deste
  ambiente de teste (de ~27 KB a mais de 1 MB em janelas de duração semelhante) — mesma classe de
  contenção de recursos já documentada para "microphone + camera"; mitigado com timeouts
  generosos e 2 retries (decisão registrada #30/#31). Validado com 2 de 3 execuções completas da
  suíte 100% limpas e a terceira precisando dos retries (mesmo nível de estabilidade já aceito
  para "microphone + camera" neste mesmo ambiente).

### Pausar/retomar (Fase 1)

Sétimo incremento da Fase 1 — RF-010: pausar e retomar uma gravação em andamento sem criar um
novo segmento, diferente da segmentação (que sempre fecha o arquivo atual e abre um novo).

- **Mecanismo nativo, não stop/restart**: `MediaRecorder.pause()`/`.resume()` suspendem/retomam a
  MESMA gravação dentro do MESMO container WebM — nenhum arquivo novo, nenhuma troca de handle.
  Isso é fundamentalmente diferente do ciclo stop/start-novo-recorder usado pela rotação de
  segmento; pausar nunca incrementa `segmentIndex`.
- **Máquina de estados já suportava, sem alterações**: `RECORDING↔PAUSED` e `PAUSED→STOPPING` já
  eram transições válidas em `RECORDING_TRANSITIONS` desde o scaffolding da Fase 0 — confirmado
  por inspeção antes de escrever qualquer código; `pause()`/`resume()` em
  `RecordingSessionManager` delegam a validade inteiramente a `stateMachine.transitionTo()`
  (rejeita, por exemplo, pausar sem sessão ativa ou retomar sem estar pausado).
- **`pauseIntervals` no manifest**: `{pausedAtMs, resumedAtMs}[]` — log em nível de SESSÃO (não
  por trilha, já que pausar/retomar afeta todas as trilhas juntas), persistido em
  `manifest.json` a cada pausa/retomada, útil para uma futura edição descartar os trechos
  pausados automaticamente. Uma sessão finalizada com `stop()` ainda pausada fecha o
  `pauseIntervals` deixando o último intervalo com `resumedAtMs: null` (registra que a gravação
  terminou pausada, sem inventar um horário de retomada que nunca aconteceu).
- **Ordem main-primeiro**: `pause()`/`resume()` no renderer chamam o IPC do main ANTES de tocar
  em qualquer `MediaRecorder` local — se o main rejeitar a transição (estado inválido), o
  renderer nunca chega a pausar um recorder que precisaria ser revertido depois.
- **Timer de segmentação por tempo pausa com o tempo RESTANTE, não reinicia do zero** — reiniciar
  o timer inteiro a cada retomada deixaria um segmento crescer até quase o dobro do limite
  configurado ao longo de pausas repetidas. `rotationTimerStartedAtRef`/
  `rotationTimerRemainingMsRef` (por trilha) guardam quanto já se passou; `resume()` reagenda
  `scheduleTimeRotation` só com o tempo que faltava.
- **Tempo decorrido congela durante a pausa**: `totalPausedMsRef` acumula a duração de cada pausa
  fechada; o cálculo do indicador `REC HH:MM:SS` subtrai esse total, então o relógio não avança
  enquanto `PAUSADO`.
- **UI**: `RecordingControls` alterna entre "Pausar"/"Retomar" (mesmo botão, rótulo muda com o
  estado) ao lado de "Parar"; o indicador de gravação mostra `PAUSADO HH:MM:SS` (ponto sem pulsar)
  em vez de `REC HH:MM:SS` enquanto pausado. `RecordingSetupPage` trata `'paused'` como gravação
  ativa para fins de desabilitar a troca de fontes (pausar não permite reconfigurar tela/câmera/
  microfone no meio da sessão).
- Testado de ponta a ponta em `tests/e2e/recording.spec.ts` (cenário "pause/resume", microfone
  sozinho — a fonte mais simples, já que pausar/retomar não depende de qual fonte é gravada, só
  do comportamento do `MediaRecorder` e da máquina de estados) e via 9 testes sintéticos em
  `recording-session-manager.test.ts` (pausa/retomada simples, múltiplos ciclos, `stop()` ainda
  pausado, e as 4 rejeições: sem sessão, pausa dupla, retomar sem pausar, `projectId` divergente).

### Marcadores (Fase 1)

Oitavo incremento da Fase 1 — RF-016: durante uma gravação ativa, marcar o instante atual
(timestamp + título/nota opcionais no modelo de dados). A tabela `markers`, o repositório
(`MarkerRepository`) e o tipo `Marker` de `06_DATA_MODEL.md` já existiam desde o scaffolding da
Fase 0, sem nenhum canal IPC nem UI até este incremento.

- **`timestampMs` é tempo GRAVADO, não tempo de parede** — calculado como `Date.now() -
  startedAtMs`, descontando a soma de todo intervalo de pausa já FECHADO (`pauseIntervals`),
  mesmo raciocínio já usado para o cronômetro (`elapsedMs`) e para o timer de segmentação por
  tempo (ver "Pausar/retomar" acima). Garante que o marcador aponte pro mesmo instante que o
  usuário via no indicador no momento do clique, mesmo que a gravação já tenha sido pausada e
  retomada antes.
- **Só permitido durante `RECORDING`, nunca `PAUSED`** — decisão registrada: enquanto pausado o
  "instante atual" já está congelado (é sempre o mesmo desde que a pausa começou), então não há
  nada de novo pra marcar. `RecordingSessionManager.addMarker` rejeita explicitamente fora de
  `RECORDING`; a UI reflete a mesma regra escondendo o botão "Marcador" (só aparece durante
  gravação ativa, ao lado de "Pausar"/"Parar" — nunca durante `PAUSADO`).
- **Canal de escrita (`recording.addMarker`) separado do de leitura (`markers.list`)** — criar um
  marcador depende da sessão de gravação ativa (fica em `recording.handlers.ts`, junto com
  start/stop/pause/resume); listar marcadores de um projeto não depende de nenhuma sessão em
  andamento (funciona igual durante ou depois da gravação), então vive em seu próprio domínio
  IPC (`markers.handlers.ts`), útil desde já para verificação de teste e para uma futura tela de
  detalhes do projeto na Biblioteca.
- **UI desta etapa era o "marcador instantâneo"** — clicar em "Marcador" criava um marcador sem
  título/nota (ambos `null`), mostrando só um contador discreto ("N marcadores") ao lado do
  cronômetro. O schema/IPC/banco já validavam e persistiam `title`/`note` corretamente desde o
  início (RF-016 os define como opcionais no DADO, não na UI) — só a captura desses campos numa
  gravação ao vivo ficou pendente até um refinamento posterior (ver abaixo).
- **Título/nota do marcador + visualização na Biblioteca (refinamento pós-MVP, sem alteração de
  backend)** — dois campos de texto opcionais (`RecordingControls.tsx`) ficam visíveis ao lado do
  botão "Marcador" durante gravação ativa, preenchidos ANTES do clique (não um modal bloqueante
  depois - evita interromper a gravação ao vivo pra digitar) - o clique captura o marcador com o
  que estiver digitado naquele instante via `recording.addMarker({projectId, title, note})`
  (schema inalterado, já suportava os dois campos desde RF-016) e limpa os campos, prontos pro
  próximo marcador. Os marcadores de uma gravação já finalizada ficam visíveis nos detalhes
  expandidos da Biblioteca (mesmo painel de trilhas/segmentos, LIB-002) - primeira UI real
  consumindo `markers.list` (canal existente desde RF-016, só exercitado por teste até aqui).
  Zero mudança de schema/IPC/repositório - o gap era inteiramente de UI, os dois canais já
  suportavam tudo que faltava.
- Testado de ponta a ponta em `tests/e2e/recording.spec.ts` (cenário "markers" atualizado - um
  marcador com título/nota preenchidos, outro deixado em branco de propósito, confirmando os dois
  caminhos e que os campos são limpos após o clique; um segundo teste confirma que o botão fica
  escondido e a ação é bloqueada durante `PAUSADO`), em `tests/e2e/library.spec.ts` (o mesmo
  cenário de detalhes/renomear/excluir agora também cria um marcador com título/nota durante a
  gravação e confirma que aparece nos detalhes expandidos) e via 7 testes sintéticos em
  `recording-session-manager.test.ts` (timestamp relativo ao início com `vi.useFakeTimers()`,
  desconto de pausa fechada, título/nota opcionais, persistência via `listMarkers`, e as 3
  rejeições: sem sessão ativa, durante pausa, `projectId` divergente).

### Monitor de espaço em disco (Fase 1)

Nono e último incremento da Fase 1 — RF-042: impedir que uma gravação comece sem espaço mínimo
disponível, avisar durante a gravação quando o espaço estiver ficando baixo, e encerrar a gravação
com segurança (sem corromper segmentos) se o disco chegar perto de esgotar. `disk-space.service.ts`
(`getDiskSpace`/`assertMinimumDiskSpace`) já existia desde a Fase 0 mas nunca era exercitado por
nenhum teste real; os dois limiares (`diskSpaceWarningThresholdMb`/`diskSpaceCriticalThresholdMb`)
já existiam em `recordingPresets` sem nenhuma UI.

- **Verificação prévia bloqueia o início, não só avisa** — `RecordingSessionManager.start()` ganhou
  um terceiro parâmetro opcional `minimumFreeBytes`; quando informado, roda `assertMinimumDiskSpace`
  ANTES de `stateMachine.transitionTo('PREPARING')`, então uma rejeição nunca deixa a máquina de
  estados travada nem chega a criar a árvore de diretórios do projeto. O parâmetro é
  deliberadamente opcional e resolvido pelo handler IPC (`diskSpaceCriticalThresholdMb` convertido
  para bytes), não lido internamente pelo manager — mantém os testes unitários existentes rápidos e
  determinísticos (omitir o parâmetro pula a checagem inteiramente).
- **Limiar crítico faz dupla função**: é o piso mínimo pra começar a gravar E o gatilho de
  auto-stop durante o monitoramento contínuo — mesmo número, duas checagens.
- **Limiares lidos a cada tick de polling, não cacheados no início da sessão** — ao contrário da
  segmentação por tempo/tamanho (que trava os valores em refs no `start()`), um monitor de
  segurança deve reagir a uma mudança de configuração feita no meio de uma gravação em andamento.
- **Polling contínuo no renderer** (`useRecordingSession.ts`, `DISK_SPACE_POLL_INTERVAL_MS = 5000`)
  roda durante `recording` E `paused` (diferente do cronômetro, que congela na pausa — espaço em
  disco pode continuar caindo por outros processos mesmo com a gravação pausada). Banner de aviso
  (`role="alert"`) aparece só no estado `warning`; o estado `critical` não tem banner dedicado —
  dispara quase imediatamente um `stop()` automático, cuja mensagem amigável chega pelo mesmo campo
  `error` já usado para falhas normais (via um `autoStopReasonRef` que sobrevive até o `setState`
  final de `stop()`).
- **Bug real encontrado e corrigido: interop CJS/ESM do pacote `check-disk-space` sob o
  `externalizeDepsPlugin()` do electron-vite.** `import checkDiskSpace from 'check-disk-space'`
  compila para `const checkDiskSpace = require("check-disk-space")` sem desembrulhar `.default`,
  mas o formato real do pacote é `{ default: fn, ... }` — chamar o objeto como função lança
  `TypeError: checkDiskSpace is not a function`. Isso já quebrava silenciosamente o handler
  `system.getDiskSpace` (usado pelo `DiskSpaceIndicator` da Home) desde a Fase 0, sem nenhum teste
  que exercitasse o caminho real para pegar o problema. Corrigido de forma defensiva em
  `disk-space.service.ts`, resolvendo `.default` apenas quando o import não é diretamente chamável
  (funciona com qualquer bundler).
- **Bug real encontrado e corrigido: `contextBridge` do Electron não preserva `.name` nem
  propriedades customizadas de um `Error` ao cruzar do preload isolado pro mundo do renderer** —
  só `.message` sobrevive (achado empírico, confirmado por dois rounds de teste diagnóstico
  temporário). O design original de `IpcError` (com `.code`/`.metadata` como propriedades próprias)
  chegava ao renderer sempre como um `Error` genérico sem o código. Corrigido codificando o código
  como prefixo `[CODIGO] ` dentro de `.message`, com `extractIpcErrorCode` no renderer extraindo o
  prefixo de volta via regex — a única representação comprovadamente estável através da fronteira.
- Testado via 5 testes sintéticos em `recording-session-manager.test.ts` (inicia normalmente sem o
  parâmetro, inicia normalmente quando o limite é trivialmente satisfeito, rejeita quando o limite
  excede o espaço real disponível, máquina de estados permanece em `IDLE` após rejeição, um novo
  `start()` funciona depois de uma rejeição anterior) e 6 testes de `classifyDiskSpace` em
  `disk-space-thresholds.test.ts` (limites exatos contam como o lado mais seguro). Ponta a ponta em
  `tests/e2e/recording.spec.ts` (cenário "disk space monitor", 2 testes): configurar os dois
  limiares para um valor absurdo (`999_999_999` MB) via `settings.update` simula "disco cheio" sem
  precisar esgotar disco real, exercitando o caminho completo real (IPC real, syscall real via
  `check-disk-space`, persistência real de settings) sem nenhum mock interno — mesmo espírito do
  T-REC-007 de `10_TESTING_QA.md`. Testes reais de syscall são mais lentos sob carga; seguindo o
  padrão já estabelecido para os testes de câmera (decisões #23/#31), o describe usa
  `retries: 2` e timeouts generosos (`DISK_SPACE_TEST_TIMEOUT_MS`/`DISK_CHECK_TEST_TIMEOUT_MS`).

### Recuperação de gravações incompletas (Fase 2)

Décimo incremento, primeiro da **Fase 2 — Recovery + Library** — RECOV-002 (detecção) e RECOV-003
(reparo). RECOV-001 (o `manifest.json` em si) já existia desde a Fase 0/1, mas nunca era realmente
consumido por ninguém: `RECOVERABLE` já fazia parte do grafo de transições da máquina de estados
desde o scaffolding, sem nenhum código que chegasse a produzi-lo. Um projeto cujo processo morreu
(crash, encerramento forçado, queda de energia, ou simplesmente o usuário fechando a janela sem
clicar em "Parar" - não há nenhum handler de `before-quit` que finalize uma sessão ativa, decisão
deliberada) fica preso num status não-terminal para sempre, sem este incremento.

- **Detecção roda uma única vez no boot** (`RecoveryService.detectIncomplete()`, chamado em
  `main/index.ts` logo após `createAppContext`, ANTES do IPC ficar acessível a qualquer janela) —
  nenhuma tela pode chegar a interagir com um projeto ainda com um status de "sessão em andamento"
  que na verdade pertence ao processo anterior. Um processo recém-iniciado nunca tem nenhuma sessão
  real ativa (`RecordingSessionManager.activeSession` sempre começa `null`), então encontrar um
  projeto em `PREPARING`/`RECORDING`/`PAUSED`/`STOPPING`/`FINALIZING` no boot só pode significar
  isso. Detecção é idempotente e nunca lança - uma falha ao ler o manifest de UM projeto (arquivo
  corrompido/removido por fora do app) não pode travar o boot do app inteiro nem a detecção dos
  demais; o pior caso é esse projeto ficar `RECOVERABLE` sem segmentos, resolvido no reparo.
- **Achado importante: o reparo enumera segmentos a partir do BANCO, não do `manifest.json`.** O
  manifest só é reescrito no `start()`, a cada ROTAÇÃO de segmento e no `stop()` - o segmento
  atualmente aberto de uma trilha que nunca rotacionou fica de fora dele até o próximo desses
  eventos. Um crash durante o PRIMEIRO segmento de cada trilha (o caso mais comum) deixaria o
  manifest mostrando um array de segmentos vazio, mesmo com dados reais gravados em disco - o
  banco, ao contrário, ganha a linha do segmento de forma síncrona no primeiro chunk
  (`segmentRepository.create` em `openNewSegment`), então é a lista mais confiável do que
  realmente existiu. O `manifest.json` é inteiramente RECONSTRUÍDO a partir do banco já corrigido
  ao final do reparo - autocura a própria defasagem que motivou usar o banco como fonte.
- **Cada segmento é validado contra o arquivo REAL no disco** (`fs.stat()`, existe + tamanho > 0) -
  nem o `byteSize` da linha do banco (só atualizado em `markFinalized`, portanto também defasado
  para o segmento aberto no momento do crash) reflete com certeza quantos bytes chegaram ao disco;
  o próprio arquivo é o único dado pós-crash confiável. Segmentos inválidos (ausentes ou 0 bytes)
  são descartados do banco E o arquivo vazio/inutilizável é removido do disco - nunca uma linha
  "válida" fantasma nem um resto de 0 bytes esquecido na pasta `source/`.
- **Segmentos válidos ainda não finalizados são promovidos a `finalized: true` best-effort**, mesmo
  sem o evento `stop()` do `MediaRecorder` - um WebM escrito em chunks sucessivos é um formato
  "streamable" (não exige um trailer/Cues final para a maior parte dos players conseguirem abrir e
  tocar os dados já gravados), então perder só o último flush de alguns ms é preferível a descartar
  o segmento inteiro.
- **Status final é `COMPLETED` se ao menos uma trilha sobreviveu com ao menos um segmento válido,
  senão `FAILED`** - marcar `COMPLETED` sem nenhum dado recuperável enganaria o usuário com um
  "sucesso" vazio na Biblioteca. Trilhas sem nenhum segmento válido são inteiramente removidas do
  manifest reconstruído (as linhas de `tracks` no banco permanecem, sem efeito prático nesta fase).
- **UI**: a Biblioteca mostra um selo "Incompleta" (`role="status"`) ao lado do título de qualquer
  projeto `RECOVERABLE`, com um botão "Reparar" que chama `recovery.repair` e recarrega a lista
  inteira (não só corrige o item localmente - o reparo também pode mudar `durationMs`/`endedAt`).
- Testado via 10 testes sintéticos em `recovery.service.test.ts` (compartilha o mesmo
  `RecordingSessionManager` real dos demais testes de gravação - inicia uma sessão real, escreve
  chunks reais, e deliberadamente NUNCA chama `stop()`, reproduzindo um crash de verdade sem
  precisar matar nenhum processo): detecção marca `RECOVERABLE` só projetos com sessão realmente
  interrompida (ignora `IDLE` vazio e `COMPLETED`), é idempotente; reparo recupera um segmento
  válido com o tamanho real do arquivo, descarta um segmento de 0 bytes e marca o projeto `FAILED`
  quando nada sobrevive, mantém só as trilhas que de fato sobreviveram quando trilhas diferentes
  crasham de formas diferentes, e continua funcionando via banco mesmo com o `manifest.json`
  totalmente ausente. Ponta a ponta em `tests/e2e/recording.spec.ts` (cenário "recovery"): DOIS
  lançamentos reais e sequenciais do Electron no mesmo teste - o primeiro inicia uma gravação real
  e fecha a janela sem clicar em "Parar" (nenhum `before-quit` finaliza a sessão, exatamente como
  documentado acima), o segundo relança o app (mesmo `userData`/banco - decisão já registrada de
  que os testes desta suíte não isolam `userData` por lançamento) e confirma o selo "Incompleta" na
  Biblioteca, repara pelo clique, e confirma o status final `COMPLETED` com o arquivo de segmento
  ainda intacto no disco.

### Biblioteca: detalhes, renomear, excluir (Fase 2)

Décimo primeiro incremento - LIB-002 (detalhes), LIB-004 (renomear) e LIB-006 (excluir). LIB-001
(listar) e LIB-005 (mostrar na pasta, via `project.openFolder`) já existiam desde incrementos
anteriores - com este, a Fase 2 - Recovery + Library fica completa.

- **Detalhes agregados direto do banco, nunca escaneando o disco de novo** - `getProjectDetails`
  soma `segments.byteSize` por trilha (já mantido corretamente pelo `RecordingSessionManager`/
  `RecoveryService`), evitando um `fs.stat` por arquivo toda vez que o usuário expande um item.
  Buscado sob demanda ao clicar "Detalhes" (não junto com a lista inteira, que só precisa do
  resumo já presente em `ProjectResponse`).
- **Renomear e excluir rejeitam um projeto com gravação ativa** (`PREPARING`/`RECORDING`/`PAUSED`/
  `STOPPING`/`FINALIZING` - mesma lista de estados usada por `RecoveryService.INTERRUPTIBLE_STATES`,
  reaproveitada aqui com propósito diferente: bloquear a ação, não detectar recuperação) - evita
  corromper arquivos ainda abertos pelo `RecordingSessionManager`.
- **Excluir remove o disco PRIMEIRO, só removendo a linha do banco se isso funcionar** - ao
  contrário de `project.openFolder` (que trata "pasta já sumiu" como resultado normal, não erro),
  aqui uma falha real ao apagar (ex.: arquivo aberto/travado por outro processo) mantém o projeto
  visível/re-tentável na Biblioteca, nunca some da lista enquanto os arquivos ainda ocupam disco em
  algum lugar sem nenhum jeito de encontrá-los de novo pelo app (recuperabilidade/preservação de
  dados do usuário).
- **UI**: "Detalhes" expande mostrando duração, trilhas (tipo + segmentos + tamanho) e tamanho
  total; "Renomear" vira o título num campo editável inline (sem modal); "Excluir" exige um
  segundo clique de confirmação ("Sim, excluir") antes de qualquer chamada IPC - ação irreversível.
- **Novo arquivo de teste E2E dedicado** (`tests/e2e/library.spec.ts`, não mais uma seção dentro de
  `recording.spec.ts`) - decisão registrada: a partir daqui os cenários de ponta a ponta deixam de
  ser todos "sobre gravação" (este é sobre a tela da Biblioteca em si); um arquivo por área de
  produto fica mais fácil de navegar conforme a suíte cresce ao longo do roadmap.
- Testado via 9 testes sintéticos em `project.service.test.ts` (mesmo padrão de reaproveitar o
  `RecordingSessionManager` real para gerar trilhas/segmentos/estado "gravação ativa" reais, já
  usado por `recovery.service.test.ts`): agregação de detalhes com/sem dados, renomear com
  sucesso/projeto inexistente/gravação ativa, excluir com sucesso (banco + disco)/projeto
  inexistente/gravação ativa (mantendo banco e arquivos intactos). Ponta a ponta em
  `library.spec.ts`: grava uma sessão curta real, expande detalhes, renomeia, exclui com
  confirmação, confirma que a pasta some do disco.

### Editor: criar e abrir projeto de edição (Fase 3)

Décimo segundo incremento - primeiro da **Fase 3 — Editor MVP** - EDIT-001. As tabelas
`edit_projects`/`edit_operations` (06_DATA_MODEL.md) já existiam desde o scaffolding da Fase 0,
sem nenhum canal IPC nem UI até agora. Este incremento entrega só "criar/abrir um projeto de
edição vinculado a uma gravação" - a timeline em si (playhead, corte, split, undo/redo, layout,
preview, EDIT-002 em diante) fica para os próximos incrementos, deliberadamente separados dado o
tamanho da Fase 3 (12 sub-itens no roadmap).

- **Sem restrição de unicidade entre gravação e projeto de edição** (por desenho do schema,
  `edit_projects.projectId` não é `UNIQUE`) - a mesma gravação pode ter vários projetos de edição
  independentes (ex.: "versão completa" e "versão curta" da mesma reunião). `editor.create` por
  isso NUNCA é idempotente/"abre se já existe" - sempre cria um novo.
- **Só é possível criar um projeto de edição para uma gravação `COMPLETED`** - mesmo raciocínio já
  registrado para `ProjectService.renameProject`/`deleteProject` (decisão #52): editar uma
  gravação ainda em andamento corromperia arquivos ainda em uso pelo `RecordingSessionManager`;
  editar uma `RECOVERABLE`/`FAILED` não faz sentido antes de reparar (RECOV-003) ou aceitar a
  perda dos dados.
- **`name` é opcional, com o título da gravação original como padrão** - mesma convenção já usada
  em outros lugares do app ("nome derivado, editável depois").
- **UI**: a Biblioteca ganha um botão "Editar" (só em gravações `COMPLETED`) que cria o projeto de
  edição e navega direto para ele. A nova tela "/editor" (rota `Projetos` na barra lateral) lista
  TODOS os projetos de edição de qualquer gravação - equivalente à Biblioteca, mas para edições. A
  página de detalhe (`/editor/:id`) por enquanto só mostra metadados + um resumo somente-leitura
  da gravação vinculada (reaproveitando `library.getDetails`, já existente desde LIB-002) - a
  timeline chega nos próximos incrementos.
- Testado via 13 testes sintéticos em `editor.service.test.ts`: cria com nome padrão/customizado,
  rejeita gravação inexistente e todo status que não seja `COMPLETED` (`IDLE`/`RECORDING`/
  `PAUSED`/`RECOVERABLE`/`FAILED`, via `it.each`), permite múltiplos projetos de edição para a
  mesma gravação, busca por id/rejeita id inexistente, lista vazia/com múltiplas gravações. Ponta
  a ponta em novo arquivo `tests/e2e/editor.spec.ts` (mesmo padrão de arquivo por área de produto,
  decisão #54): grava uma sessão real curta, cria o projeto de edição pela Biblioteca, confirma a
  navegação e o resumo da gravação vinculada, reabre pela lista geral "/editor"; segundo teste
  confirma a rejeição ao tentar editar uma gravação que nunca chegou a `COMPLETED`.

### Timeline: dados e visualização somente-leitura (Fase 3)

Décimo terceiro incremento - EDIT-002. Ainda sem nenhuma operação de edição (`edit_operations`,
tabela já existente desde a Fase 0, segue sem consumidor) - cada clip nesta etapa é sempre 1:1 com
um segmento gravado. Sem playhead/scrubber/preview de vídeo (isso é EDIT-003), sem
arrastar/cortar/dividir (EDIT-004/005) - só a estrutura da gravação posicionada no tempo, a base
visual sobre a qual os próximos incrementos constroem interatividade.

- **Eixo 0-based ancorado em `project.startedAt`** (início da SESSÃO inteira), não no início de
  cada segmento/trilha individualmente - mesmo raciocínio já usado por marcadores/cronômetro
  durante a gravação (`timestampMs` relativo ao início, não tempo de parede, ver decisão #36).
  Garante que trilhas que começaram a gravar alguns ms depois uma da outra (câmera pronta antes do
  microfone, por exemplo) fiquem alinhadas no mesmo referencial visual, não cada uma "começando do
  zero" na tela.
- **Timeline compilada no `EditorService`, direto do banco (`tracks`/`segments`)** - mesmo
  raciocínio já usado por `getProjectDetails` (LIB-002, decisão #51): o banco já é a fonte
  confiável para essa agregação, sem precisar reler nenhum arquivo do disco.
- **Só segmentos `finalized` entram na timeline** - um segmento não finalizado só poderia existir
  aqui via um bug (o reparo, RECOV-003, sempre finaliza ou descarta, nunca deixa
  `finalized: false` para trás); o filtro é uma defesa, não um caminho esperado.
- **Trilha sem nenhum clip sobrevivente não aparece** (ex.: áudio do sistema sem suporte na
  plataforma, RF-005) - nada para desenhar, só ruído visual.
- **UI (`Timeline.tsx`)**: posicionamento por porcentagem (`left`/`width` relativos a
  `totalDurationMs`), não por pixel fixo - responsivo à largura do container sem recalcular nada em
  JS ao redimensionar a janela. Régua com marcações em intervalos "redondos" (1/2/5/10/15/30/60s
  etc.), nunca uma casa decimal de milissegundo arbitrária.
- Testado via 6 novos testes sintéticos em `editor.service.test.ts` (reaproveitando o mesmo
  `RecordingSessionManager` real já usado por `recovery.service.test.ts`/`project.service.test.ts`
  para gerar trilhas/segmentos reais): projeto de edição inexistente, timeline vazia (gravação sem
  trilhas), um clip posicionado próximo do início, múltiplas trilhas ancoradas na mesma sessão
  (não cada uma no seu próprio zero), segmentos rotacionados como clips separados e ordenados
  corretamente, segmento nunca finalizado excluído (e a trilha inteira também, se nada sobrevive).
  Ponta a ponta em novo `test.describe('editor (timeline)')` dentro de `editor.spec.ts`: grava
  microfone + câmera, cria o projeto de edição, confirma duas faixas (uma por trilha) com um clip
  cada.

### Preview: protocolo de mídia local + player mínimo (Fase 3)

Décimo quarto incremento - EDIT-003 (parte 1 de 2 - só o preview de UMA trilha por vez; sincronizar
múltiplas trilhas simultaneamente com um playhead único fica para o próximo incremento, dado o
tamanho do desafio de reprodução multi-track). Sem esse incremento, o único jeito de ver o que foi
gravado era abrir a pasta do projeto no explorador de arquivos - agora dá pra assistir/ouvir direto
no app.

- **Desafio central**: os segmentos gravados vivem em caminhos reais no disco
  (`Documentos\MeetingStudio\projects\<id>\source\...`), fora do alcance de um `<video src="file://...">`
  no renderer - `webSecurity` nunca é desativado e Node.js nunca é exposto ao renderer (ambos
  proibidos por este projeto). A solução é um **esquema de protocolo customizado**
  (`meeting-media://`, `main/media/media-protocol.ts`) registrado via `protocol.handle` do
  Electron - o processo main resolve `projectId` para o `rootPath` real (nunca um path bruto vindo
  do renderer, mesmo padrão de `project.openFolder`/`recovery.repair`), valida o resultado contra
  o boundary do projeto, e serve o arquivo com suporte real a `Range` (essencial para o
  `<video>`/`<audio>` conseguir buscar/adiantar sem baixar o arquivo inteiro primeiro).
- **`registerSchemesAsPrivileged` roda no TOPO do módulo `main/index.ts`, antes de
  `app.whenReady()`** - exigência do próprio Electron para marcar um esquema como
  `standard`/`secure`/com suporte a Fetch e streaming; só depois disso, já dentro de `bootstrap()`
  com o `ProjectRepository` real disponível, o handler de fato (`protocol.handle`) é registrado.
- **CSP ganhou `media-src 'self' meeting-media:`** em ambos os conjuntos de diretivas (dev/prod) -
  sem essa entrada, `default-src 'self'` bloquearia qualquer `<video src="meeting-media://...">`.
- **Validação em duas camadas**: um filtro de FORMATO (`isValidMediaRelativePath`, regex que só
  aceita exatamente `source/<tipo>/<arquivo>.webm`) roda ANTES de qualquer acesso a banco/disco,
  em defesa profunda; `assertPathWithinBoundary` (já existente, reaproveitado) garante que o
  caminho final nunca escapa do `rootPath` do projeto.
- **Content-Type derivado da SUBPASTA dentro de `source/`, nunca da extensão isolada** - todo
  segmento é sempre `.webm`, mas o container carrega vídeo+áudio (tela/câmera) ou só áudio
  (microfone/áudio do sistema); o navegador precisa do tipo certo pra decidir como decodificar.
- **Preview escolhe UMA trilha só** (`pickPreviewTrack`: prioriza tela, depois câmera, cai para a
  primeira trilha de áudio se não houver vídeo) e toca só o PRIMEIRO clip dela - sem playhead
  ligado à timeline ainda (isso é o próximo incremento).
- Testado via 15 novos testes sintéticos: `guessMediaContentType`/`parseRangeHeader`/
  `isValidMediaRelativePath` (`tests/unit/main/media-protocol-utils.test.ts` - funções puras sem
  nenhum import de `electron`, mesmo padrão já usado por `disk-space-thresholds.ts`/
  `segmentation-thresholds.ts`: nada que importa `electron` de verdade neste projeto tem teste
  unitário dedicado, só o que fica livre disso), `buildMeetingMediaUrl`
  (`tests/unit/shared/media-protocol.test.ts` - encoding de path com espaços/acentos, separadores
  Windows normalizados, segmentos vazios descartados), `pickPreviewTrack`/`isVideoTrackType`
  (`tests/unit/renderer/pick-preview-track.test.ts`). Ponta a ponta em novo
  `test.describe('editor (preview)')`: grava com câmera, cria o projeto de edição, confirma que o
  `<video>` decodificou um frame real (`videoWidth > 0`) via o protocolo customizado - `duration`
  sozinho não é usado como sinal (WebM produzido por `MediaRecorder` em chunks sucessivos costuma
  reportar `Infinity` até o navegador escanear mais do stream, comportamento conhecido do
  Chromium, não um bug deste app).

### Playhead sincronizado e reprodução multi-trilha (Fase 3)

Décimo sexto incremento - EDIT-003 (parte 2 de 2, completando o preview). Antes deste incremento
o player só tocava UMA trilha isolada, sem nenhuma ligação com a timeline acima dela. Agora
"Reproduzir" avança TODAS as trilhas ao mesmo tempo (vídeo + áudio, em lockstep), a régua da
timeline mostra um playhead ao vivo, e clicar em qualquer ponto da régua/lane busca (seek) o
player inteiro para aquele instante - o desafio técnico central desta fase, como já registrado no
incremento anterior.

- **Relógio mestre em software (`requestAnimationFrame` + `performance.now()`), não o `timeupdate`
  de um elemento "líder"** — deixar um `<video>`/`<audio>` real ditar o relógio é frágil: ele para
  de disparar eventos exatamente durante a troca de `src` na fronteira de um clip, que é o momento
  mais crítico pra sincronizar as OUTRAS trilhas. Com um relógio independente
  (`useMultiTrackPlayback.ts`), cada elemento só é corrigido (seek) quando se desvia do relógio
  além de `DRIFT_THRESHOLD_SECONDS` (250ms) - suficiente para uma ferramenta de revisão, sem
  pretender ser sample-accurate como um editor profissional.
- **Lógica pura extraída para `timeline-playback.ts`, testável sem DOM nenhum**: `findClipAtTime`
  (qual clip cobre um instante global, ou `null` num gap/antes do primeiro/depois do último),
  `clipLocalTimeSeconds` (converte o instante global no `currentTime` local do arquivo daquele
  clip), `isDrifting` (decide se o desvio justifica um seek corretivo), `msFromPointerOffset`
  (converte um clique em pixel no instante global correspondente) - mesmo padrão já usado por
  `segmentation-thresholds.ts`/`disk-space-thresholds.ts`: o hook que toca `HTMLMediaElement`
  fica só com a orquestração, sem nenhuma decisão que valha a pena testar isoladamente escondida
  nele.
- **TODAS as trilhas tocam, não só a exibida no preview** — trilhas de VÍDEO (tela/câmera) sem
  prioridade de exibição (`pickPreviewTrack`) ficam com o elemento oculto (`hidden`, prontas para
  um futuro layout picture-in-picture, EDIT-011); trilhas de ÁUDIO (microfone/áudio do sistema)
  nunca têm elemento visual próprio, mas SÃO OUVIDAS - reconstituir o áudio completo de uma
  reunião (não só a trilha escolhida pro preview) é o ponto principal de ter múltiplas trilhas de
  áudio gravadas separadamente.
- **Playhead desenhado DENTRO de cada lane de trilha (e na régua), não uma única linha absoluta
  sobre o componente `Timeline` inteiro** — a régua não reserva a coluna do rótulo da trilha
  (110px), então tem uma largura diferente das lanes; uma única linha "global" posicionada em % do
  container inteiro ficaria desalinhada com os clips. Desenhar o playhead dentro de cada elemento
  clicável usa sempre a MESMA referência de largura que aquele elemento já usa pros seus próprios
  marcos/clips, sem precisar medir nada em JS (mantém o princípio já registrado na decisão #61 -
  posicionamento 100% por porcentagem, sem recálculo em JS ao redimensionar).
- **Reset de estado do player via `key={editProject.id}` no componente pai, não um `useEffect`
  chamando `setState`** — o padrão recomendado pelo React pra "resetar estado quando um id muda" é
  remontar a subárvore, não sincronizar manualmente; evita também o anti-padrão de setState
  síncrono dentro de um efeito (torna o reset atômico e o hook mais simples).
- Testado via 15 novos testes sintéticos das quatro funções puras
  (`tests/unit/renderer/timeline-playback.test.ts`) e um quinto teste E2E
  (`test.describe('editor (playback)')`): grava câmera + microfone, aperta "Reproduzir" e confirma
  que AMBAS as trilhas avançam juntas (`video.currentTime` E `audio.currentTime` > 0.1s),
  "Pausar" congela o instante (confirmado esperando e comparando o `currentTime` antes/depois),
  e clicar perto do início da régua faz as duas trilhas voltarem juntas. Limiares de tempo
  propositalmente frouxos (a gravação real dura só ~1-2s neste ambiente de teste) - o objetivo é
  provar o COMPORTAMENTO de sincronização, não validar matemática de proporção exata contra uma
  gravação tão curta.

### Corte, split e remover intervalo (Fase 3)

Décimo sétimo incremento - EDIT-004/005/006. Primeira operação de edição REAL - até aqui a
timeline era só leitura, agora o usuário pode efetivamente encurtar a gravação. "Trim" (alterar
início/fim útil), "Split" (dividir num ponto) e "Delete range" (remover um trecho) são todos o
MESMO primitivo aqui, como o próprio `05_MEDIA_EDITOR.md` §6 já sugere no exemplo de modelo de
edição: um `REMOVE_RANGE` que apaga `[startMs, endMs)` de TODAS as trilhas simultaneamente.

- **`edit_operations` (tabela + `EditOperationRepository`, existentes desde a Fase 0, zero
  consumidores até agora) ganham seu primeiro tipo de operação.** Um LOG ordenado (`sequence`) por
  projeto de edição - `EditorService.getEditedTimeline()` pega a timeline BRUTA
  (`getTimeline`) e aplica cada operação por cima, uma de cada vez, na ordem em que foram
  criadas. Operações de tipos ainda não implementados (gain/fade/camera transform - EDIT-008 em
  diante) são ignoradas silenciosamente pelo compilador - o log nunca quebra por causa de um tipo
  futuro.
- **`startMs`/`endMs` de cada operação são relativos à timeline JÁ EDITADA no momento em que foram
  criadas, não à bruta original** - o mesmo referencial que o usuário via na tela ao fazer aquele
  corte especificamente. Um segundo corte "empurra" a partir do resultado do primeiro, não da
  gravação original - `removeRange()` sempre valida contra `getEditedTimeline()` (o estado ATUAL),
  nunca contra `getTimeline()` (a base intocada).
- **Algoritmo de corte puro** (`main/services/apply-remove-range.ts`, sem nenhum import de
  `electron`): para cada clip de cada trilha, um clip inteiramente antes do corte fica intocado,
  um inteiramente depois desloca para a esquerda pela duração removida, e um que se sobrepõe ao
  corte é truncado - ou DIVIDIDO em dois (mesmo `segmentId`/arquivo, janelas diferentes) se o corte
  cai inteiramente no meio dele. Um novo campo `sourceStartMs` em `TimelineClip` (sempre `0` na
  timeline bruta) guarda ONDE dentro do ARQUIVO de origem o clip resultante começa - necessário
  porque um clip cortado pela cabeça não começa mais do zero do próprio arquivo.
  `useMultiTrackPlayback`'s `clipLocalTimeSeconds` soma esse offset ao calcular o `currentTime` do
  player.
- **UI**: "Cortar antes daqui"/"Cortar depois daqui" (trim, um clique, usam o playhead atual como
  fronteira) e "Marcar início da seleção"/"Marcar fim da seleção" + "Remover trecho selecionado"
  (delete range/split, seleção manual de um intervalo arbitrário, destacada em vermelho
  translúcido na timeline). Depois de qualquer corte bem-sucedido, o player salta pro início
  (`playback.seek(0)`) - o instante anterior pode nem existir mais na timeline mais curta.
- **Bug real encontrado e corrigido durante a validação E2E**: `playback.playheadMs` é
  alimentado por deltas de `performance.now()` (relógio mestre do player, EDIT-003 parte 2) -
  **fracionário** por natureza, mas `RemoveRangeRequestSchema` exige `startMs`/`endMs` inteiros.
  Clicar em "Cortar antes daqui" durante a reprodução enviava um `endMs` fracionário, a validação
  Zod rejeitava na fronteira do IPC, e o botão nunca voltava a ficar desabilitado (sintoma:
  timeout esperando o estado da UI assentar, reproduzido de forma consistente, não uma flakiness
  ambiental qualquer). Corrigido arredondando UMA VEZ na origem (`setPlayheadMs`, dentro do hook) -
  poupa todo consumidor futuro de lembrar disso individualmente.
- Testado via 11 novos testes sintéticos do algoritmo puro
  (`tests/unit/main/apply-remove-range.test.ts` - antes/depois/tocando a fronteira/split ao
  meio/engolido inteiro/multi-trilha com layouts diferentes), 8 novos testes de integração do
  `EditorService` (`tests/unit/main/editor.service.test.ts`, segmentos com `startedAtMs` FIXO para
  matemática precisa - a precisão do algoritmo em si já está coberta pelos testes puros) e um novo
  teste E2E (`test.describe('editor (trim/remove-range)')`): grava com câmera, corta o início via
  botão, confirma via `editor.getEditedTimeline` (chamada direta pela API, não parsing de texto na
  tela) que a duração encolheu, depois marca e remove uma seleção manual, confirmando um segundo
  encolhimento.

### Desfazer e refazer (Fase 3)

Décimo oitavo incremento - EDIT-007. `edit_operations` já era um log ORDENADO desde EDIT-004/005/
006 (nunca apagado por design) - faltava só um CURSOR de posição nesse log para desfazer/refazer
virarem possíveis sem reescrever nada do que já existia.

- **Novo campo `edit_projects.activeOperationSequence`** (migration `0001_cynical_jamie_braddock`,
  a primeira migration real deste projeto além da inicial) - quantas operações do log (por
  `sequence`) estão ATIVAS na timeline editada atual. `getEditedTimeline` só reproduz operações com
  `sequence <= activeOperationSequence`; linhas além do cursor continuam existindo fisicamente no
  banco (são o "refazer" pendente) até serem podadas.
- **Desfazer/refazer NUNCA apagam uma operação do log** - só movem o cursor. `undo()` decrementa
  (rejeita se já estiver em 0 - "nada para desfazer"); `redo()` incrementa até o total de operações
  persistidas (rejeita se já estiver no topo - "nada para refazer"). Ambos incrementam `revision`,
  mesmo raciocínio de "dirty state" já registrado para `removeRange`.
- **Criar uma operação NOVA depois de um undo poda fisicamente (`DELETE`) qualquer coisa além do
  cursor antes de inserir** - o mesmo comportamento padrão de qualquer editor: uma ação nova
  invalida o "refazer" pendente, e aquele ramo do histórico nunca mais seria alcançável de qualquer
  jeito (a próxima operação sempre recebe `sequence = activeOperationSequence + 1`, sobrescrevendo
  o que estivesse ali).
- **`GetEditedTimelineResponse` ganhou `canUndo`/`canRedo`** - a UI não replica a lógica de "existe
  operação ativa pra desfazer"/"existe operação além do cursor pra refazer" sozinha; `removeRange`/
  `undo`/`redo` retornam a mesma forma estendida, sempre com os dois campos atualizados.
- **UI**: botões "Desfazer"/"Refazer" (desabilitados via `canUndo`/`canRedo`) + atalhos
  Ctrl+Z/Ctrl+Shift+Z (`05_MEDIA_EDITOR.md` §15) - o listener de teclado ignora o evento se o foco
  estiver num `<input>`/`<textarea>`/elemento `contentEditable`, mesmo que nenhum campo de texto
  exista ainda nesta tela (guard pronto pra quando existir, ex.: renomear o projeto de edição
  inline).
- Testado via 9 novos testes de integração do `EditorService`
  (`tests/unit/main/editor.service.test.ts`: rejeita undo/redo sem nada pendente, reverte pro
  estado anterior sem apagar a operação, reaplica no redo, múltiplos ciclos de undo/redo em duas
  operações NA ORDEM CORRETA, **criar uma operação nova depois de um undo poda o ramo abandonado
  permanentemente**, revision incrementa em undo e redo, erros de projeto inexistente) e um novo
  teste E2E (`test.describe('editor (undo/redo)')`): corta um trecho, desfaz pelo botão (duração
  volta ao original), refaz pelo atalho Ctrl+Shift+Z (duração encolhe de novo), desfaz de novo pelo
  atalho Ctrl+Z e corta um trecho DIFERENTE, confirmando que "Refazer" fica desabilitado (o ramo
  antigo foi podado).

### Ganho e mudo por trilha (Fase 3)

Décimo nono incremento - EDIT-008. `edit_operations.trackId`/`payloadJson` (colunas ja existentes
desde a Fase 0, comentadas especificamente para isto) reusados sem NENHUMA mudanca de schema/
migration - a mesma infraestrutura de log+cursor do undo/redo (EDIT-007) ganha um segundo tipo de
operacao, herdando desfazer/refazer/poda-de-ramo-abandonado de graca.

- **`SET_GAIN` NAO acumula com o anterior da mesma trilha, ao contrario de `REMOVE_RANGE`** - o
  mais recente ATIVO simplesmente SUBSTITUI o `gainDb`+`muted` inteiro daquela trilha
  (`EditorService.getEditedTimeline`, segunda passagem de fold apos aplicar os `REMOVE_RANGE`).
  Semantica diferente de proposito: ajustar o volume e um estado atual, nao uma transformacao
  cumulativa sobre a timeline.
- **`gainDb` limitado a [-60, 0]** - so atenuacao/mudo, sem amplificacao acima do volume original.
  Os elementos `<video>`/`<audio>` nativos usados pelo player (`useMultiTrackPlayback`) so
  suportam `volume` linear 0..1; permitir `gainDb > 0` exigiria trocar para a Web Audio API
  (`GainNode`), fora do escopo deste incremento (ver "Pendências conhecidas").
- **`muted` e `gainDb` sao campos independentes**, igual a semantica nativa de
  `HTMLMediaElement.muted`/`.volume` - alternar mudo preserva o ganho ja ajustado (nao precisa de
  logica extra pra "lembrar" o volume anterior ao desmutar).
- Conversao dB→volume linear (`10^(dB/20)`) extraida como funcao pura
  (`dbToLinearVolume`, `timeline-playback.ts`) e testada isoladamente; aplicada num `useEffect`
  dedicado em `useMultiTrackPlayback` (separado do relogio mestre de reproducao - ganho/mudo nao
  dependem da posicao do playhead).
- **UI**: botao de mudo (`Som`/`Mudo`, `aria-pressed`) + slider de ganho (`-60`..`0`, step 1) na
  coluna de rotulo de cada trilha na timeline (`Timeline.tsx`, prop opcional `onSetTrackGain` -
  omitida = so o rotulo, sem controles, mantendo o componente reutilizavel). O handler no
  componente pai (`EditorProjectPage`) deliberadamente NAO reseta o playhead/selecao (ao contrario
  de corte/undo/redo) e NAO usa o estado `busy` global (um `<input type="range">` dispara muitos
  eventos durante o arrasto) - so um guard de sequencia (`gainRequestSeqRef`) descarta uma
  resposta IPC desatualizada se o usuario arrastar mais rapido que o round-trip.
- Testado via 9 novos testes de integracao do `EditorService.setTrackGain`
  (`tests/unit/main/editor.service.test.ts`: aplica a trilha certa sem afetar as outras, um
  segundo `SET_GAIN` na mesma trilha SUBSTITUI em vez de acumular, rejeita trackId inexistente na
  timeline atual, revision incrementa, undo/redo funcionam sobre esta operacao igual a qualquer
  outra do log, uma operacao nova apos um undo poda o ramo abandonado, um `SET_GAIN` mirando uma
  trilha depois totalmente removida por `REMOVE_RANGE` nao quebra nada) + 5 testes de
  `dbToLinearVolume` (0dB=1, -60dB≈0.001, -6dB≈meia amplitude, clamps defensivos fora da faixa) e
  um novo teste E2E (`test.describe('editor (gain/mute)')`): grava microfone+camera, muta a
  trilha de microfone pelo botao, ajusta o ganho da camera pelo slider (setter nativo bypassando o
  rastreador de valor do React, mesma tecnica padrao pra simular um input controlado mudando por
  script), confirma via `editor.getEditedTimeline` que as duas trilhas sao ajustadas de forma
  independente, e que Ctrl+Z desfaz so a ULTIMA operacao do log (o ganho da camera), preservando o
  mudo do microfone (uma operacao anterior).

### Fade in/out por trilha (Fase 3)

Vigésimo incremento - EDIT-009. Mesmo truque do EDIT-008: `SET_FADE` é um TERCEIRO tipo de operação
sobre o log já existente do EDIT-007, de novo sem NENHUMA mudança de schema/migration - só uma
segunda passagem de fold em paralelo à do `SET_GAIN`, independente dela (uma trilha pode ter ambas
operações ativas simultaneamente, uma para cada campo).

- **Fade é fundamentalmente diferente de ganho: depende da posição do playhead, não só da
  timeline.** Ganho/mudo (EDIT-008) é um efeito estático - calculado uma vez quando a timeline muda
  e reaplicado só nesse momento. Fade precisa ser recalculado a CADA tick de reprodução (a cada
  frame do `requestAnimationFrame`, e a cada seek), já que "quanto falta pro fim do fade" muda
  continuamente enquanto o vídeo toca. Isso forçou consolidar dois `useEffect`s antes separados em
  `useMultiTrackPlayback` (um de montagem, outro só de ganho) num único efeito, e mover o cálculo de
  volume pra dentro de `applyTimeToTrack` (já chamada em todo tick + seek, reaproveitando o "motor"
  existente em vez de criar um terceiro caminho de atualização).
- **`fadeVolumeMultiplier` combina fade-in e fade-out via `Math.min`** (nunca excede 1, e trata
  corretamente o caso de uma trilha curta onde as duas janelas se sobrepõem no meio - o multiplicador
  mais silencioso sempre vence). Função pura em `timeline-playback.ts`, testada isoladamente sem
  precisar de um elemento `<video>` real.
- Volume final aplicado ao elemento é `dbToLinearVolume(gainDb) * fadeVolumeMultiplier(...)` - os
  dois efeitos (EDIT-008 e EDIT-009) compõem multiplicativamente, sem precisar de nenhuma
  coordenação especial entre eles.
- **UI**: dois campos numéricos ("Fade in"/"Fade out", em segundos, step 0.5) na coluna de rótulo de
  cada trilha (`Timeline.tsx`, prop opcional `onSetTrackFade` - mesmo padrão opt-in do
  `onSetTrackGain`), convertendo segundos↔ms na fronteira UI/IPC. Handler no componente pai
  (`EditorProjectPage`) com seu PRÓPRIO guard de sequência (`fadeRequestSeqRef`, independente do
  `gainRequestSeqRef`) - mesmo raciocínio do EDIT-008: não usa `busy` global, não reseta
  playhead/seleção.
- Testado via 10 novos testes de integração do `EditorService.setTrackFade`
  (`tests/unit/main/editor.service.test.ts`: aplica a trilha certa sem afetar as outras, um segundo
  `SET_FADE` na mesma trilha SUBSTITUI em vez de acumular, rejeita trackId inexistente, revision
  incrementa, undo/redo funcionam sobre esta operação, poda de ramo abandonado, uma trilha removida
  por `REMOVE_RANGE` não quebra nada, e **`SET_GAIN`/`SET_FADE` coexistem de forma independente na
  mesma trilha sem um sobrescrever o outro**) + 11 testes de `fadeVolumeMultiplier` (sem fade = 1,
  silêncio exato no início/fim da janela, rampa linear, plateau antes/depois da janela, combinação
  fade-in+fade-out via mínimo, trilha degenerada sem NaN/divisão por zero) e um novo teste E2E
  (`test.describe('editor (fade)')`): grava microfone+câmera, ajusta fade-in e fade-out da trilha de
  microfone pelos campos numéricos, confirma via `editor.getEditedTimeline` que os dois valores
  foram persistidos corretamente, e que Ctrl+Z desfaz só a ÚLTIMA operação do log (o fade-out),
  preservando o fade-in (uma operação anterior) - mesmo formato de asserção do teste de gain/mute.

### Transformação de câmera (PiP) (Fase 3)

Vigésimo primeiro incremento - EDIT-010. Terceiro tipo de operação (`SET_CAMERA_TRANSFORM`) sobre o
MESMO log de `edit_operations` do EDIT-007/008/009 - de novo sem NENHUMA mudança de schema/
migration, só mais uma passagem de fold em `getEditedTimeline`, independente das de `SET_GAIN`/
`SET_FADE`. Ao contrário delas, essa operação só é válida para uma trilha `CAMERA`.

- **`cameraTransform` (`visible`/`xPercent`/`yPercent`/`widthPercent`/`heightPercent`/`shape`) é
  `null` em qualquer trilha que não seja `CAMERA`** - posição/tamanho não tem significado pra
  áudio, e a trilha de tela é sempre o FUNDO do preview (preenche o canvas inteiro), nunca um
  overlay posicionável. `EditorService.setTrackTransform` rejeita explicitamente um `trackId` de
  outro tipo (`ValidationError`, "so e valida para uma trilha CAMERA") - a primeira operação deste
  incremento com uma restrição de TIPO de trilha, não só de existência.
- **Toda trilha `CAMERA` nasce com uma posição PiP padrão** (`DEFAULT_CAMERA_TRANSFORM`: canto
  inferior-direito, ~25% de largura/altura, visível, retangular) na timeline BRUTA - o "estado
  neutro" equivalente ao `gainDb: 0`/`fadeInMs: 0`, nunca `null` só porque nenhum ajuste foi feito
  ainda.
- **A trilha de OVERLAY (a câmera sobreposta) é distinta da trilha de FUNDO (a que preenche o
  preview inteiro)** - nova função pura `pickOverlayCameraTrack(tracks, backgroundTrackId)`
  (`pick-preview-track.ts`, ao lado do já existente `pickPreviewTrack`): retorna a trilha `CAMERA`
  SE ela for diferente da trilha de fundo escolhida por `pickPreviewTrack` (tela > câmera > primeira
  disponível) E `cameraTransform.visible` não tiver sido desligado. Numa gravação SÓ de câmera (sem
  tela), a câmera JÁ É a trilha de fundo - não faz sentido desenhá-la sobreposta a si mesma, então
  não há overlay (comportamento idêntico ao já existente antes deste incremento).
- **UI do preview**: `EditorProjectPage` ganhou um container `.editor-preview-container` com
  `position: relative` - o `<video>` de fundo continua exatamente como antes, e o `<video>` do
  overlay (quando existir) é renderizado SEM `hidden`, `position: absolute` com `left`/`top`/
  `width`/`height` calculados de `cameraTransform` (`cameraOverlayStyle`, função pura local) e
  `border-radius: 50%` quando `shape: 'circle'`. Ambos os elementos já eram montados e mantidos em
  sincronia desde o EDIT-003 parte 2 (`useMultiTrackPlayback` toca TODAS as trilhas em lockstep,
  só a exibição visual mudava) - nenhuma mudança no motor de reprodução foi necessária, só em QUAL
  elemento fica visível e COMO ele é posicionado.
- **UI da timeline**: checkbox "Mostrar câmera" + quatro sliders (X/Y/Largura/Altura, 0-100%,
  largura/altura mínimas de 5%) + select de forma (Retângulo/Círculo), só na linha da trilha
  `CAMERA` (`Timeline.tsx`, novo componente `CameraTransformControls`, prop opcional
  `onSetTrackCameraTransform` - mesmo padrão opt-in de `onSetTrackGain`/`onSetTrackFade`). Handler
  no componente pai com seu PRÓPRIO guard de sequência (`transformRequestSeqRef`, independente dos
  outros dois).
- **Bug real encontrado e corrigido durante a validação**: o teste E2E PRÉ-EXISTENTE de gain/mute
  usava um seletor genérico `cameraTrackRow.locator('input[type="range"]')` pra achar o slider de
  ganho, assumindo implicitamente que era o ÚNICO range input daquela linha - premissa que este
  incremento quebrou (a linha da trilha `CAMERA` agora tem MAIS QUATRO sliders, de posição/tamanho).
  O teste passou a falhar com "strict mode violation: resolved to 5 elements". Corrigido trocando
  pelo seletor por rótulo específico (`getByLabel('Ganho da trilha Câmera')`) - rótulo único
  mesmo com controles adicionais na mesma linha. **Lição reutilizável**: seletores de teste E2E
  baseados em atributo genérico (`input[type=...]`) dentro de um container que pode ganhar mais
  elementos do MESMO tipo em incrementos futuros são frágeis por natureza; preferir sempre um
  rótulo/`aria-label` específico, mesmo quando o container só tem um elemento daquele tipo hoje.
- Testado via 10 novos testes de integração do `EditorService.setTrackTransform`
  (`tests/unit/main/editor.service.test.ts`: timeline bruta dá o padrão PiP pra toda trilha CAMERA
  e `null` pra qualquer outra, aplica só na trilha alvo, um segundo `SET_CAMERA_TRANSFORM`
  SUBSTITUI em vez de acumular, rejeita trackId inexistente, **rejeita trackId que não é CAMERA**,
  revision incrementa, undo/redo funcionam, poda de ramo abandonado, trilha removida por
  `REMOVE_RANGE` não quebra nada, e **`SET_GAIN`/`SET_FADE`/`SET_CAMERA_TRANSFORM` coexistem de
  forma independente na mesma trilha**) + 5 testes de `pickOverlayCameraTrack` (trilha de fundo
  diferente da câmera, câmera-é-o-próprio-fundo, sem trilha câmera, `visible: false`,
  `cameraTransform` nulo defensivo) e um novo teste E2E (`test.describe('editor (camera
  transform)')`): grava microfone+câmera, confirma que os controles de transformação SÓ aparecem
  na linha da trilha CAMERA (nunca na de microfone), desliga a visibilidade pelo checkbox, ajusta a
  posição X pelo slider, confirma via `editor.getEditedTimeline` que os dois valores foram
  persistidos (visibilidade preservada ao ajustar X, mesma semântica de substituição do
  EDIT-008/009), e que Ctrl+Z desfaz só a ÚLTIMA operação (o ajuste de X), preservando a
  visibilidade desligada (uma operação anterior).

### Layout da composição (Fase 3)

Vigésimo segundo incremento - EDIT-011. QUARTO tipo de operação sobre o mesmo log de
`edit_operations` do EDIT-007/008/009/010 - de novo sem NENHUMA mudança de schema/migration. Ao
contrário de TODAS as operações anteriores (ganho, fade, transformação de câmera - todas por
trilha, `trackId` sempre preenchido), `SET_LAYOUT` mira a COMPOSIÇÃO INTEIRA (`trackId: null`,
mesmo padrão de `REMOVE_RANGE`) - layout não é uma propriedade de uma trilha especifica
(`05_MEDIA_EDITOR.md` §2: "Composition: conjunto de tracks e propriedades visuais").

- **Quatro presets** (`PIP`/`SIDE_BY_SIDE`/`SCREEN_ONLY`/`CAMERA_ONLY`), `PIP` como padrão - o
  mesmo arranjo automático já entregue pelo EDIT-010 (câmera sobreposta à tela quando ambas
  existem). `SIDE_BY_SIDE` mostra tela e câmera em painéis iguais lado a lado; `SCREEN_ONLY`/
  `CAMERA_ONLY` forçam só uma das duas a aparecer.
- **`layoutPreset` só existe na timeline EDITADA** (`GetEditedTimelineResponseSchema`), nunca na
  bruta (`getTimeline`) - mesmo raciocínio de `canUndo`/`canRedo`: layout é um conceito de edição,
  não da timeline compilada a partir dos segmentos gravados.
- **`setLayoutPreset` não valida trackId nem quais trilhas existem** - ao contrário de
  `setTrackTransform` (rejeita trilha que não é CAMERA), qualquer um dos 4 presets é sempre válido
  de gravar no log, mesmo que a gravação não tenha as trilhas necessárias (ex.: `CAMERA_ONLY` numa
  gravação só de tela). A decisão de "o que fazer quando o preset não pode ser satisfeito" fica
  inteiramente no RENDERER (`computePreviewLayout`), não no backend - evita duplicar essa lógica
  de fallback nos dois lados.
- **`computePreviewLayout(tracks, preset)`** (`pick-preview-track.ts`, nova função pura ao lado de
  `pickPreviewTrack`/`pickOverlayCameraTrack`, que ela reutiliza internamente): traduz preset +
  trilhas disponíveis num de 4 resultados (`single`/`pip`/`side-by-side`/`none`) que a UI só
  precisa desenhar. Quando o preset escolhido não tem as trilhas necessárias (`CAMERA_ONLY` sem
  câmera, `SIDE_BY_SIDE` sem uma das duas), cai de volta pro comportamento automático `PIP` -
  nunca mostra uma tela em branco só porque o preset pedido não faz sentido para esta gravação
  específica.
- **UI do preview**: select "Layout" acima do preview (`EditorProjectPage.tsx`), reaproveitando os
  MESMOS elementos `<video>`/`<audio>` já montados desde o EDIT-003 parte 2 - só o papel de cada
  um (fundo/overlay/lado-a-lado/oculto) e o container (`position: relative` de sempre, ou um novo
  `display: flex` quando o modo é `side-by-side`) mudam conforme `computePreviewLayout`. Nenhuma
  mudança no motor de reprodução.
- **Bug real de teste corrigido durante a validação** (ver decisão #98 sobre a mesma classe de
  problema no EDIT-010): nenhum desta vez, mas o padrão se repetiu como precaução - o `<select>`
  de layout foi verificado explicitamente contra o guard de foco de texto do atalho Ctrl+Z
  (`target?.tagName === 'INPUT' || 'TEXTAREA'`) e confirmado que NÃO bloqueia (um `<select>` não é
  nem `INPUT` nem `TEXTAREA`), evitando repetir o mesmo tipo de surpresa de teste do EDIT-009.
- Testado via 8 novos testes de integração do `EditorService.setLayoutPreset`
  (`tests/unit/main/editor.service.test.ts`: timeline editada relata `PIP` antes de qualquer
  `SET_LAYOUT`, aplica à composição sem depender de nenhuma trilha, um segundo `SET_LAYOUT`
  SUBSTITUI em vez de acumular, aceita qualquer preset mesmo sem as trilhas correspondentes,
  revision incrementa, undo/redo funcionam, poda de ramo abandonado, coexiste independente de
  `SET_GAIN`/`SET_FADE`/`SET_CAMERA_TRANSFORM`) + 10 testes de `computePreviewLayout` (todos os 4
  presets com/sem as trilhas necessárias, fallback pro comportamento PIP, zero trilhas) e um novo
  teste E2E (`test.describe('editor (layout)')`): grava microfone+câmera, confirma `layoutPreset`
  padrão `PIP`, troca pra "Só câmera" e depois "Lado a lado" pelo select, confirma via
  `editor.getEditedTimeline` cada troca, e que Ctrl+Z desfaz só a ÚLTIMA troca (volta pra "Só
  câmera", não até `PIP`).

### Autosave e indicador de salvamento (Fase 3)

Vigésimo terceiro incremento - EDIT-012, **último item planejado da Fase 3** antes do Marco MVP
(`05_MEDIA_EDITOR.md` §7-8: "dirty state; autosave... nunca exigir clique em salvar para proteger
horas de edição"). Diferente de todos os incrementos anteriores da fase, este não adiciona uma
operação nova ao log - a arquitetura já garantia, desde o EDIT-004/005/006, que TODA mutação
(corte, ganho, fade, transformação de câmera, layout) persiste via IPC no INSTANTE em que
acontece, nunca esperando um clique em "Salvar" que nem existe. O que faltava era (1) uma garantia
real de que essa persistência é ATÔMICA, e (2) tornar essa garantia VISÍVEL pro usuário.

- **Bug real corrigido: `appendOperation` (o ponto único de escrita de qualquer operação no log)
  agora envolve suas três escritas (`deleteAfterSequence`, `create`, `touchAfterEdit`) numa ÚNICA
  transação SQLite** (`this.db.transaction(...)`, `EditorService` passou a receber o `AppDatabase`
  bruto além dos repositórios). Antes do EDIT-012 eram três `.run()` independentes, cada um
  auto-commitando na hora - um crash do processo (queda de energia, `kill -9`, o app forçado a
  fechar) entre o `create` e o `touchAfterEdit` deixava uma linha NOVA gravada no log com
  `sequence = N+1`, mas `activeOperationSequence` ainda em `N`: a operação ficava fisicamente no
  banco porém INVISÍVEL pra `getEditedTimeline` (filtra `sequence <= activeOperationSequence`),
  silenciosamente "perdendo" a última edição do usuário antes do crash sem nenhum sinal de erro.
  Com a transação, ou as três escritas commitam juntas, ou nenhuma commita - nunca um meio-termo
  inconsistente. Exatamente o tipo de garantia que "autosave: nunca perder horas de edição"
  pressupõe existir.
- **Indicador de dirty-state na UI** (`EditorProjectPage.tsx`): um contador `pendingSaves`
  (não um booleano - várias mutações podem estar em voo ao mesmo tempo, ex.: arrastar um slider de
  ganho enquanto uma troca de layout anterior ainda não voltou) incrementado/decrementado ao redor
  de TODAS as sete mutações existentes (`removeRange`, `undo`, `redo`, `setTrackGain`,
  `setTrackFade`, `setTrackTransform`, `setLayoutPreset`), sem alterar a lógica própria de cada
  handler (mensagens de erro específicas por ação continuam intactas via `actionError`). Texto
  exibido: "Salvando alteração..." enquanto `pendingSaves > 0`, "Alterações salvas
  automaticamente" quando chega a zero sem falha, "Falha ao salvar a última alteração" (com
  destaque visual) se a última mutação rejeitou.
- **Nenhuma mudança de debounce/coalescência de operações neste incremento** - um arrasto de
  slider (ganho, transformação de câmera) continua criando uma operação por evento `input`,
  igual antes do EDIT-012 (registrado como pendência conhecida - refinamento futuro, não
  bloqueante para o Marco MVP).
- Testado via 1 novo teste de integração de atomicidade
  (`tests/unit/main/editor.service.test.ts`, `appendOperation atomicity (EDIT-012)`): simula um
  crash NO MEIO da escrita (monkey-patch de `editOperationRepository.create` pra lançar), confirma
  que o cursor/revision e o log ficam EXATAMENTE como antes da tentativa (nem linha órfã, nem
  cursor dessincronizado), e que o serviço continua funcional depois - uma operação nova,
  bem-sucedida, funciona igual. E um novo teste E2E (`test.describe('editor (autosave
  indicator)')`): grava microfone, confirma que o indicador já começa em "Alterações salvas
  automaticamente" (mesmo sem nenhuma mutação ainda), troca o layout, confirma que o indicador
  volta pro mesmo texto (nunca preso em "Salvando..." nem mostrando erro).

### Render plan e wrapper FFmpeg real (Fase 4)

Vigésimo quarto incremento - EXP-001 (render plan) + EXP-002 (wrapper FFmpeg), o PRIMEIRO da
**Fase 4 — Export**. Pipeline conceitual do doc (`05_MEDIA_EDITOR.md` §12-13): `Edit Model →
Timeline Compiler → FFmpeg Plan → Render Job → Validation with ffprobe → Output`. Este incremento
entrega só o "Timeline Compiler" (traduz a timeline editada num `RenderPlan` estruturado) + o
binário real conectado - NENHUM comando FFmpeg é gerado ainda (isso é o "FFmpeg Plan", um passo
seguinte). `export.start` continua lançando `NotImplementedError`.

- **`ffmpeg-static`/`ffprobe-static` instalados** (~80MB combinados, binário real da plataforma
  baixado no `postinstall`) - `pnpm` bloqueia scripts de instalação por padrão pra pacotes novos;
  aprovado via `pnpm approve-builds ffmpeg-static` (`ffprobe-static` não tem script de instalação,
  não precisou de aprovação), registrado em `pnpm-workspace.yaml` `allowBuilds` (mesmo padrão já
  usado pro `better-sqlite3`) - persiste a aprovação pra qualquer `pnpm install` futuro, sem exigir
  aprovação manual de novo.
- **`resolveFfmpegBinaries` (`ffmpeg-locator.ts`) agora resolve pro binário real** - prioridade:
  override explícito (testes) > variável de ambiente (`MEETING_STUDIO_FFMPEG_PATH`/
  `_FFPROBE_PATH`, criada nesta fase - útil pra apontar um binário diferente em CI/empacotamento
  futuro sem reconstruir) > o pacote `-static` instalado. `ffprobe-static` não publica tipos
  próprios nem tem `@types/ffprobe-static` no npm - declaração mínima local
  (`ffprobe-static.d.ts`).
- **`pickPreviewTrack`/`pickOverlayCameraTrack`/`computePreviewLayout` movidas de
  `renderer/features/editor/` para `shared/media/preview-layout.ts`** (decisão arquitetural
  central deste incremento) - o render plan (`main/`) precisa da EXATA mesma lógica de "qual
  trilha é fundo/overlay/lado-a-lado" que o preview ao vivo (`renderer/`) já usa, senão o vídeo
  exportado poderia mostrar um arranjo DIFERENTE do que o usuário viu no editor (um bug de
  confiança, não só cosmético). `tsconfig.node.json` e `tsconfig.web.json` já incluíam
  `src/shared/**/*.ts` desde a Fase 0 - a mudança foi só de PASTA, sem nenhum ajuste de build.
  `dbToLinearVolume` (conversão dB→volume linear, EDIT-008) movida da mesma forma, pelo mesmo
  motivo - o ganho ouvido no vídeo exportado precisa soar IGUAL ao que o usuário ajustou no editor.
- **`RenderPlan` (`main/media/render-plan.ts`) é uma estrutura de DADOS, não um comando FFmpeg** -
  `background`/`sideBySideRight`/`overlay` (vídeo) + `audio[]` (uma entrada por trilha NÃO mutada,
  com `volume` já resolvido via `dbToLinearVolume` e `fadeInMs`/`fadeOutMs` repassados) + `output`
  (resolução + faixa de tempo, EXP-006). Decisão registrada: `background`/`overlay`/
  `sideBySideRight` só recebem uma trilha cujo TIPO é realmente vídeo (`SCREEN`/`CAMERA`) -
  `computePreviewLayout` pode apontar pra uma trilha de ÁUDIO como "single" quando a gravação não
  tem vídeo nenhum (comportamento correto pro preview, que só desenha trilhas de vídeo mesmo), mas
  deixar isso vazar pro render plan confundiria um futuro construtor de comando FFmpeg a tentar
  codificar vídeo de uma trilha que não tem nenhum stream de vídeo.
- **`buildRenderPlan` não valida `rangeMs`** - a validação (`endMs` além de `totalDurationMs`,
  intervalo vazio) fica pro `ExportService` (incremento futuro), mantendo esta função pura e sem
  lançar exceção nunca.
- **`runFfmpegProcess` ganhou progresso (EXP-007) e cancelamento (EXP-008) na MESMA passada** -
  entregues junto com o wrapper porque são a mesma infraestrutura de processo (spawn + stdout/
  stderr + kill); retrabalhar a assinatura três vezes separadas não agregaria nada. Retorna
  `{ result: Promise<...>, cancel: () => void }` em vez de só uma Promise - `cancel()` mata o
  processo (`child.kill()`) de forma segura mesmo chamado depois do processo já ter terminado
  (no-op do próprio Node). `onProgress` só recebe chamadas se o CHAMADOR incluir `-progress
  pipe:1` nos próprios `args` - o wrapper nunca injeta flags que o chamador não pediu, mantendo
  `args` como a única fonte de verdade do comando real executado (auditável).
- **`parseFfmpegProgressLine` usa `out_time_us` (microssegundos), não `out_time_ms`** - por uma
  excentricidade histórica do próprio FFmpeg, `out_time_ms` também vem em MICROssegundos apesar do
  nome; `out_time_us` é a chave inequívoca do formato `-progress pipe:1`.
- Testado via 13 novos testes de `buildRenderPlan` (todos os 3 modos de layout com as trilhas
  certas, filtro de trilha não-vídeo, ganho/fade resolvidos, trilha mutada excluída do mix,
  conversão de clips, resoluções 720p/1080p, faixa de tempo padrão vs. explícita, `cameraTransform.
  visible: false`), 9 novos testes de `runFfmpegProcess`/`parseFfmpegProgressLine`/
  `computeExportProgress` (spawns reais via `process.execPath`, sem mockar `child_process` -
  exitCode/stderr/progresso/cancelamento de verdade) e 1 novo teste confirmando que
  `resolveFfmpegBinaries()` resolve pro binário real instalado. **336 testes, 32 arquivos.**
  Nenhum teste E2E novo (nenhuma superfície nova de IPC/UI ainda - `export.start` inalterado);
  confirmado que a mudança de pasta não quebrou nada em tempo de execução reexecutando os testes
  E2E existentes que exercitam as funções movidas (`editor (gain/mute)` - `dbToLinearVolume` via
  playback - e `editor (camera transform)` - `computePreviewLayout` via overlay PiP), ambos
  passaram limpos.

### Export real: comando FFmpeg + ExportService (Fase 4)

Vigésimo quinto incremento - EXP-003/004, o "FFmpeg Plan" e o "Render Job" do pipeline conceitual
(`05_MEDIA_EDITOR.md` §12-13). Primeiro incremento que efetivamente ESCREVE um arquivo de saída:
`export.start` agora dispara um render real via FFmpeg, produzindo um MP4 720p/1080p de verdade em
`<rootPath>/exports/`. Botões "Exportar em 720p"/"Exportar em 1080p" na `EditorProjectPage`, com
indicador de progresso/status; `ExportsPage` também reconsulta `export.list` periodicamente.

- **`main/media/ffmpeg-command.ts` (`buildFfmpegArgs`) traduz um `RenderPlan` num array de
  argumentos FFmpeg reais** - nunca uma string concatenada (`AGENTS.md`). Um `filter_complex` monta:
  `trim`/`atrim` + `setpts`/`asetpts` por clip (reseta o carimbo de tempo pra 0 - concatenar dois
  clips do MEIO de arquivos diferentes sem isso produziria timestamps fora de ordem), `concat` pra
  múltiplos clips na mesma trilha (uma trilha pode ter vários - um `REMOVE_RANGE` no meio de um
  segmento produz dois clips do MESMO arquivo; segmentação por tempo/tamanho produz vários arquivos
  diferentes; tratados identicamente), `scale`+`pad` pra resolução de saída, `volume`+`afade` por
  trilha de áudio, `amix` só quando há MAIS de uma trilha de áudio (evita um estágio de filtro
  desnecessário pra uma única trilha), e um `trim`/`atrim` final aplicando a faixa de tempo
  (`output.startMs`/`endMs`). Escopo deste incremento: só `background` (trilha única) - PiP
  (`overlay`) e lado-a-lado (`sideBySideRight`) reais chegaram depois, em EXP-004b (ver
  [PiP e lado-a-lado reais na exportação](#pip-e-lado-a-lado-reais-na-exportação-fase-4)).
- **`main/services/export.service.ts` (`ExportService`) orquestra o pipeline inteiro**: timeline
  editada (`EditorService.getEditedTimeline`) → `buildRenderPlan` (EXP-001) → `buildFfmpegArgs` →
  enfileira via `exportJobRunner`/`ExportJobRepository` (já instanciados desde a Fase 0/EXP-001,
  só agora exercitados de verdade) → `runFfmpegProcess` (EXP-002) com progresso conectado ao
  `JobRunner`. `startExport` é SÍNCRONO no enfileiramento (cria o job, dispara o FFmpeg em segundo
  plano via `void exportJobRunner.run(...)`) - o handler IPC devolve o job `QUEUED`/`RUNNING`
  imediatamente, sem o renderer bloquear esperando o render inteiro.
- **Bug real corrigido: `JobRunner.transition()` perdia `result`/`error` numa transição
  COMPLETED/FAILED/CANCELED** - `run()` fazia DUAS chamadas separadas a `store.update` pra uma
  única transição (uma só com `status`, via `transition()`, outra logo depois só com
  `result`/`error`/`completedAt`). `ExportJobStore.update` só grava `outputPath`/`error` quando vê
  `status` E o resto do patch JUNTOS na MESMA chamada - a segunda chamada (sem `status`) caía no
  ramo genérico de `updateProgress`, que nunca grava `outputPath`. Resultado: todo job de exportação
  terminava com `outputPath: ''` no banco, mesmo com o arquivo real escrito com sucesso no disco -
  só descoberto porque este é o PRIMEIRO incremento que exercita `JobRunner.run()` de ponta a ponta
  desde que o runner foi desenhado (Fase 0). Corrigido fundindo tudo numa única chamada
  (`transition(record, to, extraPatch)`); `ExportJobRepository` ganhou um método `cancel()` paralelo
  a `complete`/`fail` pelo mesmo motivo (`updateProgress` sozinho nunca grava `completedAt`).
- **Segundo bug real corrigido, mais sério: `buildRenderPlan` incluía CAMERA/SCREEN no mix de
  áudio mesmo não-mutadas** - este app captura CAMERA e SCREEN SEMPRE sem áudio embutido
  (`RecordingSetupPage.tsx`/`useRecordingSession.ts` pedem `getUserMedia`/`desktopCapturer`
  explicitamente com `audio: false` pras duas; áudio só existe via MICROPHONE/SYSTEM_AUDIO, trilhas
  SEPARADAS por desenho). Uma trilha CAMERA/SCREEN não-mutada (o caso comum) virava uma
  `RenderAudioLayer` normalmente, e `buildFfmpegArgs` gerava um filtro `atrim` referenciando um
  stream `:a` que o arquivo de origem simplesmente não tem - o FFmpeg real rejeitaria QUALQUER
  exportação com uma trilha de vídeo não-mutada (praticamente todo caso real). Só não foi pego pelo
  primeiro teste de integração porque o clipe sintético gerado ali (lavfi `testsrc`+`sine`) tinha
  vídeo E áudio no MESMO arquivo, ao contrário de uma trilha SCREEN/CAMERA real - corrigido
  filtrando `audio[]` por `!isVideoTrackType(track.type)` além de `!muted`, e o teste de integração
  reescrito pra gerar dois clipes sintéticos SEPARADOS (um vídeo-only via `-an`, um áudio-only via
  `-vn`), replicando a forma real dos arquivos que o app produz.
- **Nome do arquivo de saída inclui a resolução e um timestamp** (`export_<resolucao>_<epoch>.mp4`)
  - simples, sem colisão entre exportações consecutivas do mesmo projeto de edição, sem depender de
  nenhuma configuração nova.
- Testado via 12 novos testes estruturais de `buildFfmpegArgs` (null pra PiP/lado-a-lado/sem-vídeo,
  inputs/filtro bem formados, concat multi-clip com reuso de input, volume+fade+amix, sem amix pra
  trilha única, trim de faixa de tempo, rejeita path fora do projeto, termina com
  `-movflags +faststart`/`-progress pipe:1`/caminho de saída), 4 novos testes de `ExportService`
  (3 de validação sem spawnar FFmpeg + 1 de integração REAL - gera dois clipes sintéticos via o
  próprio `ffmpeg-static` instalado, roda o pipeline inteiro até um MP4 real em disco, prova que
  `buildFfmpegArgs` gera sintaxe FFmpeg genuinamente válida, não só estruturalmente plausível), 3
  novos testes de regressão pro bug do `JobRunner`/`ExportJobStore` (`export-job-store.test.ts`,
  via `JobRunner` + `ExportJobStore` reais, não um store fake em memória), mais 1 teste novo em
  `render-plan.test.ts` (CAMERA/SCREEN excluídas do mix mesmo não-mutadas) e 1 em
  `export-job.repository.test.ts` (`cancel()` grava `completedAt`). **357 testes, 35 arquivos.**
  1 novo teste E2E (`editor (export)`) grava tela+microfone real, clica no botão de exportar, espera
  o status "Concluída" e confirma que o arquivo MP4 existe de verdade em disco com bytes - a única
  forma de confirmar que a nova superfície de UI/IPC funciona de ponta a ponta, não só em isolamento.

### Exportação só de áudio - M4A/MP3/WAV (Fase 4)

Vigésimo sexto incremento - EXP-005, RF-033 ("Exportar áudio: M4A ou AAC; MP3 quando disponível no
build/licenciamento escolhido; WAV"). Botões "Exportar áudio (M4A/MP3/WAV)" ao lado dos de vídeo
na `EditorProjectPage`, mesmo indicador de status/progresso já compartilhado.

- **`StartExportRequestSchema.target` substitui o antigo campo `resolution` direto (EXP-003/004)
  por uma união discriminada** (`ExportTargetSchema`, `kind: 'VIDEO' | 'AUDIO'`) - exportar em
  vídeo sempre exige uma resolução (RF-032), exportar só em áudio exige um formato (RF-033) e
  nunca uma resolução (não faz sentido pra um arquivo sem stream de vídeo). Um único campo `kind`
  evita dois canais IPC separados pro mesmo conceito ("iniciar uma exportação").
- **`buildAudioFfmpegArgs` (`ffmpeg-command.ts`) é o "FFmpeg Plan" pro caminho de áudio** - ignora
  inteiramente `background`/`overlay`/`sideBySideRight`/`output.width`/`height` do `RenderPlan`
  (não fazem sentido sem stream de vídeo), só olha `audio[]`/`output.startMs`/`endMs`. Codec por
  formato: `aac` (M4A), `libmp3lame` (MP3, confirmado disponível no build `ffmpeg-static`
  instalado desde EXP-001/002 via `ffmpeg -version`), `pcm_s16le` sem `-b:a` (WAV - PCM linear não
  tem bitrate configurável, é sempre `sample_rate × bit_depth × canais`).
  Retorna `null` (nunca lança) quando o plano não tem nenhuma trilha de áudio - mesmo padrão de
  `buildFfmpegArgs`.
- **A mixagem de áudio (trim/concat/volume/afade/amix por trilha) foi extraída pra uma função
  compartilhada (`buildAudioMixFilter`)**, reusada tanto por `buildFfmpegArgs` (vídeo - o resultado
  vira uma trilha extra do MP4) quanto por `buildAudioFfmpegArgs` (o resultado É o arquivo de
  saída inteiro) - a MESMA lógica de mixagem, só o destino final (`-map` de uma trilha extra vs.
  `-map` único) e o codec de saída diferem entre os dois caminhos. `createInputRegistrar` (dedupe
  de `-i` por caminho absoluto) também foi extraído pelo mesmo motivo.
- **`buildRenderPlan.resolution` agora é opcional** (`BuildRenderPlanOptions`) - uma exportação só
  de áudio nunca passa resolução (`ExportService` chama `buildRenderPlan(timeline, {})`);
  `output.width`/`height` ficam `0` quando omitido, nunca lidos por `buildAudioFfmpegArgs`.
- **`ExportService.startExport` agora recebe um `ExportTarget` em vez de uma `ExportResolution`
  direta** - branch por `target.kind`: `VIDEO` monta o `RenderPlan` com resolução e chama
  `buildFfmpegArgs`, produzindo `export_<resolucao>_<epoch>.mp4`; `AUDIO` monta o `RenderPlan` sem
  resolução e chama `buildAudioFfmpegArgs`, produzindo `export_<formato>_<epoch>.<extensão>`
  (`.m4a`/`.mp3`/`.wav`). Mensagem de erro de validação diferente por caminho ("PiP/lado-a-lado
  fora do escopo" pra vídeo vs. "nenhuma trilha de áudio não-mutada encontrada" pra áudio) -
  `buildFfmpegArgs`/`buildAudioFfmpegArgs` retornando `null` por razões DIFERENTES em cada
  caminho, então uma mensagem genérica única confundiria mais do que ajudaria.
- Testado via 8 novos testes estruturais de `buildAudioFfmpegArgs` (null sem trilha de áudio,
  ignora completamente vídeo/resolução, mapeia `[afinal]`/nunca `[vfinal]`/sempre `-vn`, codec
  certo por formato com/sem `-b:a`, `amix` com múltiplas trilhas, trim de faixa de tempo, rejeita
  path fora do projeto, termina com `-progress pipe:1`/caminho de saída), 2 novos testes de
  `ExportService` (1 de validação - `ValidationError` quando a única trilha é SCREEN, video-only
  por design, sem nada exportável em áudio + 1 de integração REAL - gera um WAV de verdade a
  partir da mesma gravação sintética tela+microfone reusada do teste de vídeo, confirmando que o
  MICROFONE entra no arquivo e a TELA nunca teve stream de áudio pra começar). **367 testes, 35
  arquivos** (mesma contagem de arquivos - os novos testes foram todos ADICIONADOS aos arquivos
  já existentes de EXP-003/004, nenhum arquivo novo). Sem novo teste E2E dedicado - os botões de
  áudio reusam o MESMO fluxo de UI/polling/status já coberto pelo teste E2E `editor (export)`
  (EXP-003/004), só trocando qual botão é clicado; a cobertura real do caminho de áudio vem do
  teste de integração `ExportService` (spawn real do FFmpeg) mais os estruturais de
  `buildAudioFfmpegArgs`.

### Exportação de intervalo selecionado (Fase 4)

Vigésimo sétimo incremento - EXP-006, RF-034 ("Permitir exportar somente intervalo selecionado").
`buildRenderPlan` já aceitava `rangeMs` desde EXP-001 (groundwork nunca conectado) - este
incremento entrega só a validação + o fio até a UI, sem tocar em `render-plan.ts`/
`ffmpeg-command.ts`.

- **`StartExportRequestSchema` ganhou um campo `rangeMs` opcional** (`ExportTimeRangeSchema`, mesmo
  shape de `RemoveRangeRequestSchema` - `startMs`/`endMs` relativos à timeline EDITADA atual).
  Omitido/`null` exporta a timeline inteira (comportamento de sempre desde EXP-003/004); presente,
  `ExportService` valida `rangeMs.endMs <= timeline.totalDurationMs` (o schema em si só garante
  `startMs < endMs` - nunca conhece a duração real de uma timeline específica) antes de passar
  direto pra `buildRenderPlan`.
- **UI reusa a MESMA `selection` já usada por "Remover trecho selecionado" (EDIT-004/005/006)** -
  decisão deliberada de não criar um controle de faixa de tempo dedicado só pra exportação: o
  usuário já tem uma forma de marcar um intervalo na tela ("Marcar início/fim da seleção"), então
  exportar só ele é só mais um jeito de consumir a mesma marcação existente. Uma dica textual
  (`.editor-export-range-hint`) avisa quando uma seleção ativa vai ser usada, antes de qualquer
  clique nos botões de exportação.
- Testado via 1 novo teste de validação (`ValidationError` quando `rangeMs.endMs` excede
  `totalDurationMs`), 1 novo teste de integração REAL (exporta o MESMO clipe sintético duas vezes -
  inteiro e um recorte de 1/4 da duração - e confirma que o WAV recortado tem um tamanho de
  arquivo MUITO menor, prova concreta sem precisar de `ffprobe` de que `rangeMs` realmente corta o
  áudio exportado, não só aceita o parâmetro sem aplicar - WAV é PCM sem compressão, então o
  tamanho do arquivo é diretamente proporcional à duração codificada) e 4 novos testes de schema
  (`export.schema.ts` - aceita sem `rangeMs`, aceita com `rangeMs` válido, rejeita
  `startMs >= endMs`, rejeita um `target` que mistura `kind: 'VIDEO'` sem o campo `resolution`
  exigido). **373 testes, 35 arquivos** (mesma contagem de arquivos - tudo adicionado aos arquivos
  já existentes). Sem novo teste E2E dedicado - a UI reusa o mesmo fluxo de seleção já exercitado
  pelo teste E2E de trim (EDIT-004/005/006) e o mesmo fluxo de exportação já exercitado por
  `editor (export)` (EXP-003/004); a cobertura real do caminho de faixa de tempo vem do teste de
  integração `ExportService` (spawn real do FFmpeg).

### Progresso e cancelamento de exportação (Fase 4)

Vigésimo oitavo incremento - EXP-007/008, RF-035 ("Exibir progresso da exportação e permitir
cancelar"). Progresso (EXP-007) já estava pronto desde EXP-003/004 - a infraestrutura
`onProgress`/`JobRunner` (conectada em EXP-001/002, ver decisão acima) já fluía até a UI
(`` (${exportJob.progress}%) `` no parágrafo de status), só nunca tinha sido observada de ponta a
ponta porque nenhum teste anterior olhava especificamente pra essa contagem. Este incremento
entrega a metade que realmente faltava: **cancelamento de verdade**, matando o processo FFmpeg
real, não só mudando um status no banco.

- **`ExportService.cancelExport(jobId)` faz DUAS coisas, não uma só**: mata o processo FFmpeg real
  (via um `Map<string, () => void>` privado, `activeCancelFns`, que guarda o `handle.cancel` de
  `runFfmpegProcess` enquanto o processo está em voo) E move o job pra `CANCELED` diretamente
  (`exportJobRunner.cancel`). Fazer só uma das duas deixaria ou um processo órfão rodando em
  segundo plano gravando um arquivo que ninguém mais vai usar, ou um job preso em `RUNNING` pra
  sempre (o handler que ia marcar `COMPLETED`/`FAILED` nunca roda de novo depois de matado).
  Idempotente por design: cancelar um job já terminal (`COMPLETED`/`FAILED`/`CANCELED`) é um no-op
  silencioso, não um erro - a UI pode legitimamente clicar "cancelar" bem no instante em que o job
  termina por conta própria (corrida natural, não um bug).
- **Bug de corrida real encontrado e corrigido em `JobRunner.run()` ANTES de escrever o
  cancelamento** (raciocínio de design, não um teste falhando): `JobStore.get(id)`
  (`ExportJobStore.get`) sempre devolve um objeto NOVO a cada chamada (re-consulta o banco), então
  a variável `record` capturada no início de `run()` nunca vê uma mutação feita por um `cancel()`
  CONCORRENTE em cima de um objeto `get()` diferente. Sem correção, o handler vendo
  `result.canceled` lançaria um erro (fluxo esperado), `run()` capturaria no `catch` e tentaria
  `transition(record, 'FAILED')` num job que o `cancel()` concorrente JÁ tinha movido pra
  `CANCELED` no banco - `CANCELED -> FAILED` é uma transição inválida (`JOB_TRANSITIONS.CANCELED:
  []`, estado terminal), lançando `InvalidJobTransitionError` pra um cenário que na verdade é
  correto. Corrigido re-buscando `this.store.get(id)` imediatamente antes de CADA uma das duas
  transições finais (sucesso e falha) e pulando a transição se o status real já for `CANCELED`.
- **Canal IPC `export.cancel` novo, não uma flag em `export.start`** - cancelar é uma operação
  logicamente distinta de iniciar (opera sobre um job JÁ enfileirado, identificado por `id`), mesmo
  raciocínio já usado pra outros pares início/interrupção deste app (`recording.start`/
  `recording.stop`, `recording.pause`/`recording.resume`).
- **Botão "Cancelar exportação" só aparece com um job `QUEUED`/`RUNNING`** (mesma função
  `isExportJobInProgress` que já controla o polling de status desde EXP-003/004) - reaproveitada,
  não duplicada. Ao clicar, atualiza `exportJob` direto com a resposta da chamada (já `CANCELED`),
  sem esperar o próximo tick do polling de 1s - feedback imediato.
- Testado via 2 novos testes de regressão em `job-runner.test.ts` (cancelamento concorrente
  vencendo tanto o caminho de sucesso quanto o de falha do handler - a corrida corrigida acima,
  reproduzida em isolamento com o `JobStore` fake em memória já existente no arquivo), 1 novo teste
  de integração REAL em `export.service.test.ts` (gera um clipe sintético deliberadamente maior/
  mais pesado que os demais deste arquivo - 6s, 1280x720, exportado em 1080p com `libx264 medium` -
  cancela ~300ms depois de iniciar, confirma que o job termina `CANCELED` com `outputPath: null`, e
  prova que o PROCESSO real morreu observando que o arquivo de saída parcial PARA de crescer logo
  após o cancelamento; termina confirmando que cancelar de novo o mesmo job já terminal é um no-op
  seguro) e 1 novo teste E2E (`editor (export)` - grava um pouco mais que o teste de sucesso pra
  garantir uma janela real de encode, clica "Exportar em 1080p", clica "Cancelar exportação" assim
  que aparece, confirma o status "Cancelada" e que o botão de cancelar some). **376 testes, 35
  arquivos** (mesma contagem de arquivos - tudo adicionado aos arquivos já existentes).

### Validação do arquivo exportado via ffprobe (Fase 4)

Vigésimo nono incremento - EXP-009, a etapa "Validation" do pipeline da doc (`05_MEDIA_EDITOR.md`
§12: `Edit Model → Timeline Compiler → FFmpeg Plan → Render Job → Validation → Output`) - a última
ainda faltando desde EXP-003/004, e o último item do roadmap da Fase 4: com este incremento, a
**Fase 4 — Export está completa**, marcando o **Marco MVP** do `11_ROADMAP_BACKLOG.md`.

- **`exitCode 0` do FFmpeg nunca provava, sozinho, que o arquivo escrito é um arquivo de mídia
  REAL e utilizável** — um encode que produz um container tecnicamente bem formado mas com zero
  frames de verdade (caso raro, mas possível em cenários de borda) ainda podia sair com `exitCode
  0`, e `ExportService` até este incremento só confiava nele para marcar o job `COMPLETED`.
  `ExportService.startExport` agora roda o ffprobe REAL contra o próprio `outputPath` logo após o
  FFmpeg terminar - um `throw` na validação é capturado por `JobRunner.run()` exatamente como
  qualquer outra falha do handler, marcando o job `FAILED` (nunca `COMPLETED`) com o motivo exato.
- **`runFfprobeProcess` é um wrapper de processo SEPARADO de `runFfmpegProcess`, não reaproveitado**
  — ffprobe nunca escreve num arquivo de mídia; a saída que importa é o JSON INTEIRO acumulado em
  stdout (`buildFfprobeArgs`, já existente desde EXP-002), bem diferente do progresso incremental
  `-progress pipe:1` do FFmpeg (onde só a ÚLTIMA linha `out_time_us=` de cada chunk importa, nunca
  o acumulado). Forçar os dois pelo mesmo wrapper exigiria uma flag pra alternar entre "acumular
  tudo" vs. "processar linha a linha e descartar" - mais confuso que duas funções pequenas.
- **`validateFfprobeOutput` é uma função PURA (nenhum spawn, nenhum I/O)** que interpreta o JSON
  já capturado — testável isoladamente com strings fabricadas em vez de precisar rodar um ffprobe
  real pra cada caso de borda. Um arquivo é considerado válido quando: (1) o stdout é JSON válido;
  (2) existe pelo menos um `stream`; (3) `format.duration` é um número finito POSITIVO — os três
  jeitos concretos de um export "ter dado certo pelo exitCode" mas produzido um arquivo inútil.
- **`ExportService` ganhou um construtor opcional `ffmpegBinaryOverrides`, só pra teste** — permite
  apontar o `ffprobePath` pra um binário propositalmente quebrado sem precisar de uma variável de
  ambiente global (que vazaria pra qualquer outro teste rodando em paralelo no mesmo processo);
  em produção, `app-context.ts` nunca passa esse parâmetro, sempre resolvendo os binários reais.
- Testado via 6 novos testes de `validateFfprobeOutput` (JSON inválido, não-objeto, zero streams,
  streams ausente, duração zero/ausente/não-numérica, caso válido com `durationMs` calculado
  corretamente), 4 novos testes de `runFfprobeProcess` (spawns reais via `process.execPath`, mesmo
  padrão já usado pra `runFfmpegProcess` - captura de stdout/stderr, acumulação através de múltiplos
  chunks, exit code não-zero sem lançar, rejeição quando o binário não pode ser spawnado), e 2 novos
  testes de integração REAL em `export.service.test.ts`: um que aponta `ffprobePath` pra um binário
  inexistente via `ffmpegBinaryOverrides` contra o MESMO clipe sintético válido de sempre - prova
  que mesmo um FFmpeg com `exitCode 0` e um MP4 genuinamente bom em disco termina em `FAILED` (não
  `COMPLETED`) quando a validação não consegue rodar - e outro confirmando que o caminho feliz
  (ffprobe real bem-sucedido) nunca introduz um falso negativo. **388 testes, 35 arquivos** (mesma
  contagem de arquivos - `ffmpeg-runner.test.ts` e `export.service.test.ts` já existiam). Sem novo
  teste E2E dedicado - a validação é transparente pro fluxo de UI já existente (os testes E2E
  `editor (export)`, incluindo o de cancelamento, já exercitam o caminho de sucesso da validação em
  toda exportação real que fazem); reconfirmados passando limpos nesta validação.

### PiP e lado-a-lado reais na exportação (Fase 4)

Trigésimo incremento - EXP-004b. Último refinamento pendente dentro do escopo já entregue do
Marco MVP (não um item do roadmap da Fase 4 em si, que já estava fechado desde EXP-009) -
`buildFfmpegArgs` até aqui só suportava uma única trilha de vídeo de fundo, rejeitando
(`null` → `ValidationError`) qualquer plano cujo `layoutPreset` resolvesse pra PiP ou lado-a-lado,
mesmo esses dois já funcionando perfeitamente no PREVIEW ao vivo desde EDIT-010/011. Agora o
arquivo exportado mostra exatamente o mesmo arranjo que o editor mostrou.

- **PiP usa o filtro `overlay` do FFmpeg, lado-a-lado usa `hstack`** - os dois modos reais que
  `computePreviewLayout`/`buildRenderPlan` já produziam (`overlay`/`sideBySideRight` no
  `RenderPlan`), agora com uma composição de comando real por trás de cada um. `background`
  (fundo/esquerda) e a segunda camada (`overlay`/`sideBySideRight`) reusam o mesmo helper de
  concatenação de clips (`buildConcatVideoLabel`, extraído do código que antes só existia inline
  pra `background`) - as três camadas têm exatamente a mesma forma (`RenderVideoLayer`).
- **PiP usa "cover" (`scale`+`crop`), lado-a-lado usa "contain" (`scale`+`pad`)** - escolha
  deliberada espelhando o CSS real do preview: `.editor-preview-overlay` usa `object-fit: cover`
  (a câmera preenche a caixa inteira, recortando o excesso), enquanto o layout `SIDE_BY_SIDE` não
  força nenhum `object-fit` (cada metade mostra o vídeo inteiro, com barras pretas se a proporção
  não bater - igual ao comportamento já usado pro fundo em `background` desde EXP-003/004).
- **Posição do overlay: `x`/`y` em pixels vêm direto de `xPercent`/`yPercent` × `width`/`height`
  da saída** - mesma semântica CSS já usada pelo preview (`left`/`top` são o canto SUPERIOR
  ESQUERDO da caixa relativo ao container INTEIRO, não um centro) - `overlay=x:y` do FFmpeg usa a
  mesma convenção, então a tradução é uma multiplicação direta, sem nenhum ajuste de referencial.
- **`overlay=...:eof_action=pass`, não o `repeat` padrão do FFmpeg** - se a trilha da câmera
  terminar antes da trilha de fundo (câmera parou de gravar mais cedo que a tela, por exemplo), o
  overlay simplesmente DESAPARECE dali em diante - o padrão do FFmpeg congelaria o último quadro da
  câmera por cima do fundo pelo resto do vídeo, um resultado visualmente incorreto.
- **`shape: 'circle'` continua sendo só uma aproximação, agora também no arquivo exportado, não só
  no preview** - implementar um recorte circular real exigiria um filtro `geq`/`alphamerge`
  adicional (mascarar canal alfa por coordenada) fora do escopo deste incremento; documentado como
  pendência, mesma limitação que já existia no preview desde EDIT-010 (lá via `border-radius` CSS,
  que também não é um círculo perfeito numa caixa não-quadrada).
- Testado via 8 novos testes estruturais em `ffmpeg-command.test.ts` (dois guards defensivos -
  overlay+sideBySideRight simultâneos, camada sem clip nenhum -, três confirmando o filtro `overlay`
  real - fundo preenche o quadro inteiro, câmera escalada/recortada pro tamanho exato da caixa,
  posição em pixels correta, `eof_action=pass`, ambos os inputs referenciados, `[vfinal]`+`[afinal]`
  mapeados juntos -, e três confirmando `hstack` - cada metade com `scale`+`pad` pro tamanho exato,
  ambos os inputs referenciados, o trim de faixa de tempo aplicado por cima do composto), e 2 novos
  testes de integração REAL em `export.service.test.ts` que geram DOIS clipes sintéticos de vídeo
  (tela + câmera, ambos video-only) e exportam de verdade - um em PiP (layout padrão automático com
  as duas trilhas presentes) e outro em lado-a-lado (via `setLayoutPreset`) -, confirmando via
  ffprobe REAL que a saída tem EXATAMENTE a resolução pedida (1280×720) - só alcançável se o
  `overlay`/`hstack` real funcionou, não só "um MP4 não-vazio qualquer". **397 testes, 35 arquivos**
  (mesma contagem de arquivos - tudo adicionado aos arquivos já existentes). 1 novo teste E2E
  (`editor (export)` - grava tela E câmera juntas, confirma que `layoutPreset` resolve pra `'PIP'`
  automaticamente, exporta em 720p, confirma "Concluída" e um MP4 real em disco) - a primeira vez
  que um teste deste projeto grava as duas fontes de vídeo simultaneamente especificamente pra um
  cenário de exportação.

### Transcrição: abstração de provedor (Fase 5)

Trigésimo segundo incremento - AI-001, primeiro incremento da **Fase 5 — Transcrição**
(`11_ROADMAP_BACKLOG.md`), a primeira fase genuinamente pós-Marco MVP. Entrega o CONTRATO inteiro
(schema de banco, repositórios, job assíncrono, canais IPC, UI mínima) sem nenhuma chamada de rede
real ainda - `transcription.start` sempre enfileira com sucesso (mesmas validações de projeto/
trilha de áudio que uma integração real teria), mas o job sempre termina `FAILED` com uma mensagem
clara assim que roda, porque nenhum `TranscriptionProvider` real está conectado em lugar nenhum.
Mesmo padrão já usado por `export.start` em EXP-001/002 (infraestrutura pronta, último passo
arriscado/custoso adiado explicitamente).

- **Por que não já conectar um provedor real (ex.: OpenAI, AI-002 no roadmap) agora** —
  `09_SECURITY_PRIVACY_COMPLIANCE.md` §11 exige um aviso explícito ANTES do primeiro envio de
  áudio a um provedor externo ("O áudio selecionado será enviado ao provedor de IA configurado
  para processamento") e §5 exige que a chave de API (sempre DO PRÓPRIO usuário, nunca uma padrão
  deste app) seja armazenada com segurança (`safeStorage`) - as duas coisas envolvem custo real e
  uma decisão de privacidade do usuário sobre um app que se descreve como "local-first" logo na
  primeira linha deste README, não uma escolha técnica livre para delegar (diferente da maioria
  das decisões de arquitetura registradas neste documento). AI-002 entrega a integração real, esse
  consentimento, o armazenamento seguro da chave, e o pipeline de mixagem de áudio (reusando
  `buildAudioFfmpegArgs`, EXP-005) que alimenta `TranscriptionProvider.transcribe`.
- **Três tabelas, não uma só** (`transcription_jobs`, `transcripts`, `transcript_segments`,
  `06_DATA_MODEL.md` "Transcript"/"TranscriptSegment") — mesma separação já usada em `export_jobs`
  (rastreio do PROCESSO) vs. o arquivo final (nunca modelado como linha de banco), mas diferente
  num ponto: o RESULTADO de uma transcrição precisa ser consultável linha a linha (as fases
  futuras de busca/semântica, Fase 7, vão consultar `transcript_segments` diretamente), então
  `transcripts`/`transcript_segments` são linhas de banco de verdade, escritas SÓ quando um job
  termina `COMPLETED` - nunca uma linha "parcial" visível enquanto o job ainda está em voo.
- **`TranscriptionProvider` é uma interface pura (`transcription/transcription-provider.ts`),
  ainda sem nenhuma implementação concreta** — o contrato que AI-002 vai implementar
  (`transcribe(request, onProgress): Promise<TranscriptionResult>`), documentado e pronto, mas
  `TranscriptionService` não recebe nenhuma instância dele em lugar nenhum nesta fase - nenhum
  parâmetro "meio conectado" fingindo o contrário do que está implementado de verdade.
- **`buildTranscriptEntities` (função pura) já existe e já é testada, mesmo sem nenhum chamador em
  produção ainda** — gera os ids e monta `TranscriptEntity`/`TranscriptSegmentEntity[]` a partir
  de um resultado de provedor hipotético; mesmo princípio de "scaffolding de função pura testável
  isoladamente antes do pipeline inteiro existir" já usado por `computeExportProgress` (EXP-002,
  testado antes de `ExportService` sequer existir).
- **UI mínima nos detalhes expandidos da Biblioteca** (não no editor) — transcrição é uma
  propriedade da GRAVAÇÃO crua (`Transcript.projectId`, não `editProjectId`), então vive ao lado
  de "Detalhes"/"Marcadores" na tela onde o usuário já vê a gravação como um todo, reusando
  exatamente o mesmo padrão de "buscar sob demanda ao expandir" + polling de status já usado por
  marcadores/exportação.
- Testado via 13 testes reais em `transcription.service.test.ts` (repositórios/`JobRunner` reais,
  sem nenhum mock - validação de projeto ausente/não-`COMPLETED`/sem trilha de áudio, enfileiramento
  real confirmando que o job SEMPRE termina `FAILED` com a mensagem exata, `listJobs`/`getStatus`,
  e `getTranscript` lendo o transcript mais recente com segmentos ordenados por `startMs` via dados
  semeados diretamente pelo repositório), 3 testes de `buildTranscriptEntities` isolado, 5 novos
  testes de schema (`StartTranscriptionRequestSchema`/`TranscriptResponseSchema`), e a atualização
  de `migrate.test.ts` (agora 11 tabelas/11 índices, não mais 8/8). **415 testes, 37 arquivos**
  (2 arquivos novos: `transcription.service.test.ts` e a própria migração gerada). 1 novo teste E2E
  em `library.spec.ts` (grava uma sessão real curta, clica "Transcrever" nos detalhes expandidos,
  confirma que o status chega em "Falhou" com a mensagem exata "Nenhum provedor de transcrição
  configurado" - a única forma de confirmar que o pipeline de IPC/job chega até a UI de ponta a
  ponta) - passou limpo isolado numa execução (49,2s); execuções subsequentes bateram na mesma
  classe de flakiness de bootstrap já documentada extensivamente neste README, sob uma queda de
  RAM livre real confirmada (~800MB → ~415MB de 16GB durante a validação), nunca dentro do código
  deste incremento.

### Busca full-text: FTS5 local (Fase 7)

Trigésimo terceiro incremento - SEARCH-001, primeiro incremento da **Fase 7 — Knowledge**
(`11_ROADMAP_BACKLOG.md`, "Pesquisa"). A doc separa explicitamente três sub-fases dentro de
"Pesquisa": Fase 1 "Full-text search local", Fase 2 "Embeddings e busca semântica" e Fase 3
"Perguntas sobre múltiplas reuniões" - só a primeira não depende de nenhum provedor externo (sem
custo, sem envio de dados, sem o gate de consentimento do `09_SECURITY_PRIVACY_COMPLIANCE.md`
§11 que bloqueia AI-002), então é a única com que este roadmap avança autonomamente por ora -
mesma linha divisória já registrada entre AI-001 (livre) e AI-002 (precisa do usuário).

- **SQLite FTS5, tabela de "conteúdo externo"** (`transcript_segments_fts`, migração escrita à
  mão em `0003_search_fts.sql`) — `CREATE VIRTUAL TABLE ... USING fts5(text, content=
  'transcript_segments', content_rowid='rowid')` guarda só o índice invertido, nunca uma cópia do
  texto (que já vive em `transcript_segments.text`); o `rowid` implícito da tabela real (toda
  tabela SQLite tem um, mesmo com PK `TEXT` declarada, a menos que seja `WITHOUT ROWID`) é a ponte
  entre os dois lados de qualquer resultado de busca. Três gatilhos SQL (`AFTER INSERT/DELETE/
  UPDATE`) mantêm o índice em sincronia automaticamente NO NÍVEL DO BANCO - qualquer inserção
  futura em `transcript_segments`, mesmo por um caminho de código que esqueça de atualizar o
  índice manualmente, nunca deixa o FTS desatualizado.
- **Migração escrita à mão, não gerada por `drizzle-kit generate`** — o Drizzle não modela tabelas
  virtuais FTS5 no schema TypeScript (`main/database/schema/*.ts`), então esta tabela e os três
  gatilhos nunca aparecem lá, só na migração SQL crua. Continua "versionada e revisada" (a
  exigência real de `migrate.ts` pra mudança de schema), só não "gerada" - mesmo raciocínio hoje
  documentado como padrão legítimo para o que o Drizzle não consegue expressar. Gotcha registrado:
  um `--> statement-breakpoint` (o marcador que o migrador do drizzle-orm usa pra dividir um
  arquivo `.sql` em statements individuais) colocado ANTES do primeiro statement real, isolando um
  bloco só de comentário, faz o migrador tentar executar esse bloco como se fosse SQL - erro
  `RangeError: The supplied SQL string contains no statements`. Comentários de cabeçalho precisam
  ficar no MESMO chunk do primeiro statement real, nunca isolados atrás do próprio breakpoint.
- **`SearchRepository` é o único repositório deste app usando SQL bruto** (`sql` template tag do
  `drizzle-orm`, `db.all(sql\`...\`)`) — o Drizzle não tem suporte de query-builder pra `MATCH`
  nem tabelas virtuais FTS5, então a junção `transcript_segments_fts` → `transcript_segments`
  (texto/timestamps reais, via `rowid`) → `transcripts` (provider/model) → `projects` (título,
  pro resultado exibir de onde veio) precisa ser escrita à mão. Mantém a mesma assinatura de
  construtor de todo outro repositório (só `AppDatabase`) - a raiz SQL crua fica só internamente.
- **`buildFtsMatchQuery` (função pura) nunca repassa o texto digitado pelo usuário direto pro
  `MATCH`** — tokeniza por espaço em branco, escapa aspas duplas internas dobrando-as (`"` →
  `""`), e envolve cada token como uma frase literal com prefixo (`"token"*`), unidos por espaço
  (o operador booleano padrão do FTS5 entre termos soltos é AND). Previne dois problemas ao mesmo
  tempo: erro de sintaxe FTS5 se o usuário digitar uma aspas solta ou operadores como `AND`/`NOT`/
  `NEAR` sem querer usá-los como tal (tudo vira texto literal), e dá um comportamento de "prefixo"
  natural de graça (digitar "reuni" já casa "reunião"). Retorna `null` (não lança, não gera uma
  consulta vazia) pra uma busca vazia/só espaços - `SearchService` decide então nem tocar o banco.
- **Um único canal IPC** (`search.transcripts`, leitura pura e síncrona - sem job assíncrono, FTS5
  é rápido o bastante pra rodar direto na thread do handler, mesmo padrão de qualquer outra
  consulta simples deste app) — `projectId` opcional restringe a busca a UM projeto (uso futuro,
  ex.: busca dentro da Biblioteca); omitido busca em TODAS as reuniões, o caso de uso principal
  descrito em `01_PRODUCT_VISION_PRD.md` ("memória corporativa pesquisável").
- **Nova tela "/search" + item "Busca" na navegação principal**, formulário simples (um campo +
  botão, sem busca-enquanto-digita/debounce - FTS5 é rápido o bastante pra não precisar) - dispara
  `search.transcripts` só no submit, mostra cada resultado com projeto/timestamp/falante (quando
  presente)/trecho do texto. Como AI-002 (transcrição real) ainda não existe, nenhuma busca real
  encontra nada nesta fase - um estado normal e esperado (mesmo espírito da UI de transcrição em
  AI-001, que trata "Falhou" como resultado normal, não bug), refletido no texto do estado vazio.
- Testado via 13 testes reais em `search.service.test.ts` (`buildFtsMatchQuery` isolado - tokens
  simples/múltiplos/aspas escapadas/palavras-chave de operador FTS5 nunca interpretadas como
  operador -, e `SearchService` de ponta a ponta contra um banco real, semeando transcrições
  diretamente via `TranscriptRepository.createWithSegments` já que nenhum caminho de UI cria
  transcritos reais nesta fase: busca exata, busca por prefixo, AND implícito entre múltiplos
  termos, nunca quebra com aspas/operadores no texto de busca, escopo por `projectId`, campo
  `speaker` presente/ausente), e a atualização de `migrate.test.ts` (16 tabelas - 11 originais +
  `transcript_segments_fts` + 4 tabelas-sombra internas do FTS5 -, novo teste confirmando os três
  gatilhos de sincronia). 2 novos testes E2E reais em `tests/e2e/search.spec.ts` (busca via UI
  mostra o estado "nenhum resultado" esperado - a única forma de confirmar que o pipeline de IPC
  chega até a UI de ponta a ponta nesta fase -, e o botão "Buscar" fica desabilitado pra uma busca
  só de espaços) mais a rota "Busca" adicionada à lista de navegação existente em
  `navigation.spec.ts` - passaram limpos isolados (9/9, 54,9s).

**Refinamento (mesmo incremento, resolvendo uma pendência registrada logo depois de ser
registrada)**: destaque do trecho encontrado via `snippet()` do FTS5.

- **`snippet(transcript_segments_fts, 0, ...)` precisa do NOME REAL da tabela virtual, nunca do
  alias usado no `FROM`/`JOIN`** — gotcha do SQLite/FTS5 descoberto ao rodar o teste real pela
  primeira vez: `snippet(fts, ...)` (usando o alias `fts` do `FROM transcript_segments_fts fts`,
  que funciona normalmente em `WHERE ... MATCH` e em `fts.rowid`) falha com
  `SqliteError: no such column: fts`, porque as funções auxiliares especiais do FTS5
  (`snippet()`/`highlight()`/`bm25()`) exigem o nome real da tabela, não um alias - reproduzido
  isoladamente com `better-sqlite3` puro antes do fix, comentário registrado no topo de
  `search.repository.ts` pra não repetir o erro em código futuro que use essas funções.
- **Marcadores de controle (`\x01`/`\x02`), não tags HTML, delimitam o termo destacado no
  `snippet()`** — `SearchService.parseSnippet` (função pura) divide o trecho recortado em
  `{ text, highlighted }[]`; a UI (`SearchPage.tsx`) decide como desenhar (`<mark>` em volta de
  cada parte `highlighted: true`) via JSX normal, nunca `dangerouslySetInnerHTML` - o banco nunca
  tem a oportunidade de injetar HTML arbitrário no DOM, mesmo que um transcript futuro (AI-002)
  viesse com texto malicioso de um provedor de IA comprometido.
- Testado via 5 novos testes de `parseSnippet` isolado (sem marcador, um termo destacado,
  múltiplos termos, string vazia, marcador de abertura sem fechamento correspondente nunca lança)
  e uma asserção adicional no teste de busca exata existente, confirmando contra o `snippet()`
  REAL do FTS5 (não um mock) que o termo buscado chega marcado `highlighted: true` e o resto do
  trecho como texto normal. **434 testes, 37 arquivos**.

### Transcrição real: Whisper 100% local (Fase 5)

Terceiro refinamento pos-SEARCH-001 - pedido explícito do usuário ("alguma alternativa mais
barata ou grátis pra transcrição?"), respondido com a alternativa que melhor se encaixa no
desenho deste app: rodar o Whisper (o mesmo modelo por trás da API paga da OpenAI) **direto na
máquina do usuário**, via `@huggingface/transformers` (ONNX Runtime) - zero custo por minuto,
zero envio de áudio a qualquer serviço externo. Diferente de `OPENAI` (AI-002, que continua
bloqueada aguardando o usuário - custo real + consentimento de envio de dados exigido por
`09_SECURITY_PRIVACY_COMPLIANCE.md` §11), `WHISPER_LOCAL` não passa pelo mesmo gate: a única
chamada de rede é a PRIMEIRA vez que um tamanho de modelo é usado (baixa os pesos, cacheados
depois), nunca por reunião transcrita.

- **Três tamanhos de modelo (`base`/`small`/`medium`), escolhidos pelo usuário em
  Configurações** - nenhum "certo" universal: `base` (~150MB) é o padrão, mais rápido numa
  máquina sem GPU dedicada; `small`/`medium` trocam velocidade/tamanho de download por mais
  precisão. Baixado sob demanda (cache em `userData/whisper-models`, nunca na pasta de
  gravações - um modelo de IA não é "conteúdo de uma reunião") - trocar o modelo em Configurações
  não baixa nada até a PRÓXIMA transcrição rodar de verdade.
- **Extração de áudio bruto é NOVA, não reaproveita `buildAudioFfmpegArgs` (EXP-005)** -
  `buildAudioFfmpegArgs` mixa a partir de um `RenderPlan` já COMPILADO de um projeto de EDIÇÃO;
  transcrição opera sobre a GRAVAÇÃO BRUTA (`projectId`, nunca um `editProjectId`), então
  `buildTranscriptionAudioExtractionArgs` (`transcription-audio-extraction.ts`) trabalha direto
  sobre `TrackEntity`/`SegmentEntity`: concatena os segmentos de cada trilha MICROFONE/áudio do
  sistema (rotação por tempo/tamanho gera múltiplos arquivos por trilha, mesma lógica de sempre),
  mixa via `amix` quando há mais de uma trilha, resample pra 16kHz mono PCM16 - exatamente o que
  o Whisper espera nativamente (16kHz é a taxa fixa do treino original; qualquer outra taxa só
  degradaria a precisão à toa).
- **Gotcha real do SQLite/FTS5 encontrado e documentado durante a busca (nada a ver com
  transcrição em si, mas descoberto na mesma sessão)** - já registrado na decisão anterior.
- **`@huggingface/transformers` não consegue decodificar um arquivo de áudio a partir de um
  CAMINHO no processo main do Electron** - erro real reproduzido antes de escrever
  `WhisperLocalProvider`: `Unable to load audio from path/URL since AudioContext is not
  available` (a API Web Audio só existe num processo RENDERER, nunca no main, que é puro Node).
  Resolvido com um parser de WAV PCM16 escrito à mão (`readWavPcm16Mono`) - suficiente porque
  este app sempre controla o formato de saída da extração (nunca um decoder WAV genérico),
  convertendo pra `Float32Array` antes de entregar ao pipeline.
- **`WhisperLocalProvider` recebe o pipeline de inferência via injeção (`WhisperPipelineFactory`),
  nunca chama `@huggingface/transformers` direto no corpo do método** - a MESMA técnica já usada
  em `ffmpegBinaryOverrides` (`ExportService`)/`export.service.test.ts`: em produção,
  `app-context.ts` injeta a chamada real (`pipeline('automatic-speech-recognition', repoId)`); em
  teste, um pipeline FALSO (sem rede, sem modelo real) - baixar um modelo de verdade numa suíte
  automatizada seria uma categoria de flakiness nova (dependência de rede) nunca antes presente
  neste projeto, deliberadamente mantida fora dela.
- **Pipeline cacheado por modelo** (`Map<repoId, Promise<...>>` dentro do provedor) - a segunda
  transcrição com o mesmo tamanho de modelo não recarrega os pesos do disco.
- **`env.cacheDir` configurado uma única vez em `app-context.ts`**, antes de qualquer transcrição
  poder rodar - `getWhisperModelsCacheDir()` (`app-paths.ts`, o ÚNICO lugar que lê
  `app.getPath(...)`, mesmo padrão já estabelecido) isola o cache em `userData`.
- **Teste E2E de transcrição (`library.spec.ts`) precisou de um provedor falso próprio via
  variável de ambiente** (`MEETING_STUDIO_E2E_FAKE_TRANSCRIPTION=1`, mesmo espírito de
  `MEETING_STUDIO_E2E_FAKE_MEDIA` já usado pra câmera/microfone) - clicar "Transcrever" de
  verdade baixaria um modelo real da internet a cada execução da suíte, a mesma dependência de
  rede que os testes unitários também evitam; com o override, o resto do pipeline (extração de
  áudio REAL via ffmpeg contra a gravação de verdade, IPC, persistência, UI) roda sem nenhum
  mock, só a chamada final ao modelo é substituída por um resultado instantâneo.
- Testado via `transcription-audio-extraction.test.ts` (8 testes estruturais puros - concat de
  segmentos da mesma trilha, `amix` entre trilhas diferentes, trilha vazia ignorada, dedupe de
  input, directory traversal rejeitado) e `whisper-local-provider.test.ts` (11 testes -
  `readWavPcm16Mono` decodifica PCM16 mono/estéreo com downmix, erro claro pra arquivo não-WAV;
  `mapWhisperChunksToSegments` mapeia timestamps em segundos pra ms, cobre o último chunk com
  timestamp final `null`, descarta texto vazio; `WhisperLocalProvider.transcribe` com pipeline
  injetado - progresso crescente até 100, cache de pipeline entre duas chamadas, erro do pipeline
  nunca é engolido). `transcription.service.test.ts` reescrito de ponta a ponta - extração de
  áudio REAL (segmento MICROFONE sintético via `ffmpeg-static`, mesma técnica de
  `export.service.test.ts`) + provedor FALSO injetado: job termina `COMPLETED` com transcript
  persistido de verdade, `FAILED` com a mensagem exata quando o provedor falha, `FAILED` quando a
  própria extração falha (caminho de ffmpeg quebrado). **455 testes, 39 arquivos**. 1 teste E2E
  atualizado em `library.spec.ts` (antes confirmava a falha esperada "sem provedor" de AI-001;
  agora confirma `COMPLETED` de ponta a ponta com o provedor falso via env var) - passou limpo
  isolado (52,7s); uma segunda execução bateu na mesma classe de flakiness de bootstrap já
  documentada extensivamente neste README (`getByRole('status')` sem "REC" a tempo, RAM livre
  real confirmada em ~2,5GB/16GB no momento), nunca dentro do código deste incremento.

### Player mínimo na Biblioteca + deep-link de busca (Fase 2/Fase 7)

Refinamento seguinte a AI-002-LOCAL - agora que transcrições reais existem e a busca (SEARCH-001)
encontra resultados de verdade, faltava fechar o laço: clicar num resultado e OUVIR o trecho.
Resolve duas pendências registradas ao mesmo tempo ("resultado de busca não pula pro instante" e
"`getProjectDetails` não expõe segmentos individualmente").

- **`ProjectDetailsTrack` ganha `segments: {relativePath, startedAtMs, durationMs}[]`** (só
  segmentos FINALIZADOS, ordenados por `seqIndex`) - o suficiente pra montar uma URL de player
  (`buildMeetingMediaUrl`) sem precisar de um projeto de EDIÇÃO (que já tinha essa informação via
  `getTimeline`, mas exige um `editProjectId` que a Biblioteca não tem).
- **`pickPreviewTrack` (compartilhada com o editor desde EDIT-003/EXP-001) virou genérica**
  (`<T extends { type: TimelineTrack['type'] }>`, antes fixada em `TimelineTrack[]`) - a Biblioteca
  reusa a MESMA prioridade tela>câmera>primeira disponível sobre `ProjectDetailsTrack[]`, um
  formato de objeto diferente, sem duplicar a lógica de escolha.
- **Player MINIMO, deliberadamente sem sincronizar múltiplas trilhas nem concatenar múltiplos
  segmentos de uma trilha rotacionada** - mesmo espírito da primeiríssima versão do preview do
  editor (antes da sincronização multi-track chegar em EDIT-003 parte 2): só o PRIMEIRO segmento
  finalizado da trilha escolhida. Suficiente pra "ouvir o trecho" que a busca aponta, desde que o
  instante caia dentro desse primeiro segmento - limitação conhecida, registrada em "Pendências
  conhecidas".
- **Deep-link via query string** (`/library?projectId=&startMs=`, gerado por `SearchPage.tsx`) -
  `LibraryPage` lê os parâmetros UMA VEZ na montagem (`useState` com inicializador, não um
  `useEffect` reagindo a toda mudança de `searchParams`) - navegar pra longe e voltar sem esses
  parâmetros não deveria reabrir o último projeto visto. Expande o projeto automaticamente e
  posiciona o player (`currentTime`) assim que os metadados carregam (`onLoadedMetadata`).
- Testado via `project.service.test.ts` (2 novos testes - segmentos finalizados aparecem
  corretamente, um segmento ainda ABERTO nunca aparece nessa lista) e `preview-layout.test.ts` (1
  novo teste confirmando `pickPreviewTrack` funciona sobre um objeto com forma diferente de
  `TimelineTrack`). **457 testes, 39 arquivos**. 1 novo teste E2E (`library.spec.ts`) simulando o
  deep-link exato que `SearchPage.tsx` gera (via `window.location.hash`, `HashRouter`) - confirma
  expansão automática + player visível, sem precisar de uma busca/transcrição real de ponta a
  ponta (já cobertas separadamente) - passou limpo isolado (20,0s).

### Edição e exclusão de marcadores (Fase 1)

Resolve a última pendência de marcadores registrada desde o refinamento de título/nota: um
marcador criado durante a gravação era imutável depois disso.

- **`markers.update`/`markers.delete` vivem no mesmo domínio de `markers.list`
  (`markers.handlers.ts`), nunca em `recording.*`** - editar/excluir um marcador não depende de
  sessão de gravação ativa, mesmo raciocínio já registrado pra `list`.
- **`title`/`note` aceitam `null` explícito (limpar o campo), distinto de omitido (não alterar)**
  - `UpdateMarkerRequestSchema` usa `.nullable().optional()` nos dois campos; a UI sempre envia os
  dois (nunca omite), convertendo campo vazio em `null` antes de enviar - `MarkerRepository.update`
  só toca os campos presentes no patch.
- **Achado real ao rodar o primeiro teste**: `drizzle-orm`'s `.set({})` lança `Error: No values to
  set` pra um UPDATE sem nenhum campo - `MarkerRepository.update` agora trata um patch vazio como
  no-op explícito ANTES de chegar ao query builder, nunca deixando esse erro escapar (mesmo que a
  UI hoje nunca envie um patch vazio de propósito - defensivo pra qualquer chamador futuro).
- **Botões da Biblioteca renomeados pra "Editar marcador"/"Excluir marcador"** (não só "Editar"/
  "Excluir") - evita colisão de nome acessível com os botões equivalentes do PRÓPRIO projeto
  (`Editar`/`Excluir` já existentes, ver LIB-004/006), que convivem na mesma área expandida de
  detalhes.
- Testado via `marker.repository.test.ts` (6 testes novos - update parcial de cada campo
  independente, `null` explícito limpa, patch vazio não quebra, delete não afeta outros marcadores
  do mesmo projeto) e 5 novos testes de schema (`markers.schema` - patch parcial, `null` aceito,
  string vazia rejeitada - use `null` pra limpar, id inválido rejeitado). **468 testes, 40
  arquivos**. O teste E2E existente de detalhes/renomear/excluir (`library.spec.ts`) ganhou os
  passos de editar+excluir um marcador no meio do fluxo já existente - passou limpo isolado
  (14,2s) após a primeira tentativa esbarrar no tempo total maior (mais passos reais de UI
  encadeados) sob a mesma classe de lentidão de máquina já documentada extensivamente neste
  README; `LIBRARY_TEST_TIMEOUT_MS` aumentado de 90s pra 150s de folga.

## Estrutura de diretórios

```text
src/
  main/
    index.ts, app-lifecycle.ts, window.ts, app-context.ts
    security/     secure-webpreferences, content-security-policy, navigation-guard
    ipc/          ipc-handler, register-ipc-handlers, handlers/*.handlers.ts
    recording/    recording-state-machine (tipos/grafo apenas - sem captura real)
    media/        project-filesystem, ffmpeg/ (locator + runner, sem binário/invocação real)
    database/     client, migrate, schema/, migrations/, repositories/
    services/     logger, settings.service, disk-space.service, project.service, app-paths
    jobs/         job-runner, export-job-store
  preload/        index.ts, invoke.ts, api/*.api.ts
  renderer/
    app/          App, providers, routes, HomePage, stores/, styles/
    layouts/      AppShell, Sidebar
    components/   Button, Card, EmptyState, DiskSpaceIndicator, ThemeToggle
    features/     recording/ library/ editor/ exports/ settings/ (páginas)
  shared/
    contracts/    channels.ts
    schemas/      project, settings, recording, export, system, common
    types/        recording-state, job, domain-errors, entities, preload-api
    constants/    app-info, filesystem, error-codes, error-messages
tests/
  unit/{main,shared,db,renderer}/
  e2e/            app-launch.spec.ts, navigation.spec.ts, recording.spec.ts, library.spec.ts,
                  editor.spec.ts
  fixtures/       tmp-db.ts
  setup/          vitest.setup.ts
```

## Decisões de arquitetura

A documentação não especifica tudo — onde havia lacuna, a opção tecnicamente mais sólida foi
escolhida e registrada aqui, conforme instrução do prompt inicial.

1. **Scaffolding via `electron-vite`** — orquestra main/preload/renderer com uma config só;
   maduro para esta combinação exata de stack.
2. **`better-sqlite3` sem `electron-rebuild` no fluxo normal** — a versão instalada (13.x) usa
   binários pré-compilados N-API por plataforma (`prebuilds/win32-x64.node`, `gypfile: false`),
   estáveis entre Node e Electron sem rebuild por ABI. Isso diverge da suposição inicial de que um
   passo `electron-rebuild` seria necessário em todo `dev`/`test` — os hooks `predev`/`prestart`/`pretest`
   foram removidos; `pnpm rebuild:native` fica disponível como diagnóstico manual caso uma versão
   futura da dependência volte a exigir rebuild.
3. **Sem workspace pnpm** — um único `package.json` na raiz; `electron-vite` já compila os três
   alvos a partir de um pacote.
4. **`settings` como chave-valor genérico**, não colunas fixas — a documentação define 4
   categorias conceituais (`app`, `recordingPresets`, `exportPresets`, `aiProvider`) sem schema de
   campos. Cada categoria é validada por seu próprio Zod schema em
   `shared/schemas/settings.schema.ts`. `aiProvider` não é criada nesta fase.
5. **Nenhuma tabela `jobs` polimórfica genérica** — os *tipos e o runner* (`shared/types/job.ts`,
   `main/jobs/job-runner.ts`) são genéricos e reutilizáveis hoje; a *persistência* concreta é só
   `export_jobs`, o único tipo de job que a documentação de fato especifica. Uma tabela `jobs`
   genérica pode ser adicionada via migration normal quando proxy/thumbnail/transcrição existirem.
6. **`ProjectStatus` reaproveita `RecordingState`** verbatim (`shared/types/recording-state.ts`) em
   vez de um enum próprio — nas fases 0–1 o status de um projeto é inteiramente derivado da sua
   sessão de gravação. Se o editor/export precisarem de estados independentes, o union é estendido
   via migration.
7. **Caminhos não especificados na documentação**: banco em
   `app.getPath('userData')/meeting-studio.db`; biblioteca padrão em
   `app.getPath('documents')/MeetingStudio`.
8. **Terminologia de tipo de trilha**: canônico maiúsculo/underscore (`SCREEN`, `SYSTEM_AUDIO`) no
   banco/IPC/UI; o `manifest.json` de recuperação usa um formato minúsculo (`screen`,
   `system_audio`) deliberadamente isolado, por ser um artefato de recuperação independente do
   schema SQL, não uma projeção 1:1 dele.
9. **Sem tabelas `transcripts`/`transcript_segments`/`devices`** — IA é fase futura sem schema de
   campos documentado ainda; dispositivos são efêmeros/runtime, nunca persistidos.
10. **Migrations**: `drizzle-kit generate` é a única forma sancionada de mudar o schema (arquivo
    versionado, commitado, revisável). `migrate()` roda uma vez no boot, antes de qualquer outro
    acesso ao banco — isso *é* permitido; o que é proibido é alterar schema fora de um arquivo de
    migration (`db:push`/`db:studio` são só ferramentas manuais de dev, nunca chamadas pelo app/CI).
11. **Handlers IPC reais vs. stub**: `project.*`, `settings.*`, `system.*` e `export.{list,getStatus}`
    são reais (ligados ao SQLite). `recording.start/stop` e `export.start` ficam registrados,
    tipados e validados, mas retornam `NotImplementedError` — a implementação real é Fase 1
    (Recording Core) e Fase 4 (Export), respectivamente.
12. **`window.meetingStudio.library`** é um alias somente-leitura de `project` (mesmos canais IPC)
    — preserva o nome do exemplo conceitual da documentação (`library.list()`) ao lado da
    nomenclatura de entidade usada no banco (`projects`).
13. **`electron-builder` ainda não instalado** — `pnpm build` compila main/preload/renderer, não
    produz instalador. Empacotamento real é adiado para mais perto de um release.
14. **`ffmpeg-static`/`ffprobe-static` ainda não instalados** — só o wrapper tipado
    (`spawn(binary, args)`) e o construtor de argumentos existem; binários reais entram quando
    FFmpeg for de fato invocado (Fase 1/4).
15. **Resolução de `app.getAppPath()` fora de um build empacotado**: para que
    `services/app-paths.ts` encontre `src/main/database/migrations` em modo
    dev/build-verificação, o Electron precisa ser iniciado apontando para a **raiz do projeto**
    (onde `package.json`/`main` vivem) — `electron .`, não `electron out/main/index.js`
    diretamente. Passar o `.js` direto faz `app.getAppPath()` resolver para `out/main/`, quebrando
    o caminho de migrations. `pnpm start` e os testes E2E (`tests/e2e/*.spec.ts`) já usam a forma
    correta; qualquer execução manual do build deve fazer o mesmo.
16. **Tema (claro/escuro/sistema)**: fonte de verdade é o backend (`settings.app.theme`, SQLite),
    não `localStorage` — a store Zustand (`renderer/app/stores/theme.store.ts`) é só um cache de
    UI, hidratado via IPC no mount e persistido a cada troca.
17. **Biblioteca e Exportações usam dados reais** (via IPC), não mockados — a Home mantém os 3
    cards mockados conforme explicitamente permitido pelo prompt, mas Biblioteca/Exportações já
    demonstram o pipeline completo renderer→preload→IPC→main→SQLite funcionando.
18. **Sem `library.store.ts`/`exports.store.ts` dedicados** — o estado de carregamento dessas
    páginas é local (`useState`/`useEffect`), não Zustand, já que não é compartilhado entre
    componentes; Zustand fica reservado para estado genuinamente global (tema).
19. **TypeScript pinned em 6.0.3** (não a última 7.x) — exigido pela faixa de peer dependency do
    `typescript-eslint` hoje. `ignoreDeprecations: "6.0"` silencia o aviso de depreciação de
    `baseUrl` (removido no TS 7), necessário enquanto essa restrição existir.
20. **`package.json` sem `"type": "module"`** — mantém a saída CJS padrão do `electron-vite` para
    main/preload sem exigir ajustes; `eslint.config.mjs` usa extensão explícita `.mjs` para ser
    sempre interpretado como ESM independentemente disso.
21. **Preload com dependências empacotadas (`build.externalizeDeps: false` + `ssr` externo só para
    `electron`)** — descoberto empiricamente durante a validação desta fase: com `sandbox: true`,
    o preload roda num `require()` restrito que só resolve módulos nativos do Electron/Node, nunca
    pacotes de `node_modules` (ex.: `zod`) em runtime. O `electron-vite` 5 externaliza dependências
    por padrão mesmo sem o plugin `externalizeDepsPlugin()`, então o preload falhava
    silenciosamente ("module not found: zod") até essa opção ser desativada explicitamente em
    `electron.vite.config.ts`. Qualquer nova dependência npm usada em `src/preload/` precisa
    continuar assim (empacotada), diferente de `src/main/`, que mantém `externalizeDepsPlugin()`
    (necessário para não quebrar o módulo nativo `better-sqlite3`).
22. **E2E de gravação real dividido em pares, não um único teste de 3 trilhas** — capturar tela +
    câmera + microfone simultaneamente via hardware/streams reais neste ambiente de teste mostrou-
    se pesado demais (codificação de vídeo é cara), causando falta de recursos intermitente para
    uma das trilhas, apesar da lógica em si (`RecordingSessionManager`) já estar provada correta
    com 3 trilhas simultâneas via dados sintéticos (sem essa restrição de hardware). Dois cenários
    de 2 trilhas cobrem cada par real sem empilhar as três de uma vez.
23. **Timeouts de poll/teste elevados + 2 retries no cenário microfone+câmera** (não no cenário
    tela+microfone, que nunca mostrou o sintoma) — rodando a suíte completa (12 testes, 1 worker,
    vários lançamentos sequenciais do Electron no mesmo processo Node), a trilha de vídeo da
    câmera especificamente mostrou flakiness intermitente que não se reproduz isolada nem nos
    testes sintéticos, ou seja, é contenção cumulativa de recursos (GPU/CPU) deste ambiente/
    topologia de teste (N instâncias reais do Electron em sequência), não um bug de aplicação.
    `beforeEach`/`afterEach` (não `beforeAll`/`afterAll`) garantem que cada retry relança uma
    instância fresca do Electron. Ver comentário completo em `tests/e2e/recording.spec.ts`.
24. **Áudio do sistema degrada graciosamente, não é hard-fail** (diferente de tela/câmera/
    microfone, cuja falha de aquisição aborta a gravação inteira) — RF-005 explicitamente enquadra
    essa fonte como "quando suportado pela plataforma"; uma falha aqui só deixa aquela trilha sem
    segmento, sem impedir as demais. Ver `TRACK_TYPE_INFO` em `recording-session-manager.ts` e o
    comentário em `useRecordingSession.ts`.
25. **Captura de áudio do sistema sempre emparelhada com vídeo de uma fonte `screen`** (nunca
    audio-only) — achado empírico: pedir só áudio via `chromeMediaSource: 'desktop'`
    (`video: false`) derruba o processo de renderer (crash, não Promise rejeitada) no Electron/
    Chromium testado aqui. A fonte de vídeo usada como portador é escolhida automaticamente (o
    primeiro `kind: 'screen'` disponível) e seu vídeo é sempre descartado logo após a aquisição.
26. **Pastas de projeto continuam nomeadas por `<project-id>` (UUID), nunca pelo título** — assim
    como `03_TECHNICAL_ARCHITECTURE.md` já especificava ("guardar mídia em estrutura independente
    do banco"). Renomear a reunião no futuro nunca exige renomear a pasta (arriscado com
    sincronização de nuvem tipo OneDrive/Google Drive rodando por cima de `Documentos`); títulos
    livres não precisam de sanitização de caracteres invalidos de path; duas reuniões podem ter o
    mesmo título sem colisão. A navegabilidade manual (achada confusa ao testar - "só UUID, difícil
    de achar no Explorer") é resolvida por `project.openFolder` (RF-017, item 27) em vez de mudar o
    nome da pasta.
27. **`project.openFolder` recebe só o `id`, nunca um path** — o main resolve o `rootPath` real via
    `projectService.getProject`, então só pastas de projetos legítimos (já criados pelo próprio
    app) podem ser abertas; nunca um caminho arbitrário vindo do renderer. `shell.openPath` retorna
    uma string de erro em vez de lançar - tratado como `{opened: false}` (não um erro IPC), já que
    "pasta movida/apagada por fora do app" é um estado esperado, não excepcional.
28. **Rotação de segmento sinalizada pelo proprio chunk, sem canal IPC dedicado** — o renderer
    decide QUANDO rotacionar (compara `totalBytes` já devolvido por `appendChunk` contra
    `sizeSegmentationMb`; timer contra `timeSegmentationMinutes`) e só envia um `segmentIndex`
    maior no próximo chunk. O main reage a essa mudança reaproveitando a mesma lógica de criação
    preguiçosa que já existia para o primeiro segmento — mais simples e com menos superfície de
    corrida do que um canal `recording.rotateSegment` dedicado.
29. **Configuração de segmentação é global (Configurações), não por gravação** — reaproveita o
    schema `recordingPresets` já existente desde a Fase 0 (`timeSegmentationMinutes`/
    `sizeSegmentationMb`, ambos nullable e independentes - se os dois estiverem preenchidos, o que
    for atingido primeiro dispara a rotação). `qualityPreset`, mesma categoria de settings,
    permanece sem UI neste incremento (schema existe, nada ainda o consome).
30. **Guarda contra rotação redundante (`rotationInFlightRef`)** — `MediaRecorder.stop()` emite um
    último chunk de flush antes do evento `'stop'`; esse chunk ainda pertence ao segmento antigo
    mas seu `totalBytes` continua acima do limite (bytes só crescem), o que sem essa guarda
    disparava uma segunda rotação logo após a primeira, apagando o segmento recém-criado quase
    instantaneamente. A guarda é marcada no PONTO DE DISPARO (`requestRotation`, síncrono, antes
    de enfileirar no `withTrackLock`), não dentro de `rotateTrack` em si - por essa altura uma
    rotação anterior já teria terminado e liberado a marca, então checar ali não teria efeito.
31. **2 retries + `beforeEach`/`afterEach` no cenário E2E de segmentação** (mesmo padrão já usado
    para "microphone + camera", decisão #23) — mesma classe de contenção de recursos já
    documentada para a trilha de vídeo da câmera, não um bug de lógica (a rotação em si está
    provada correta via 4 testes sintéticos dedicados, sem essa restrição de hardware, e via
    execução E2E isolada e repetida após a correção do item #30).
32. **`pauseIntervals` é por SESSÃO no manifest, não por trilha** — pausar/retomar afeta todas as
    trilhas simultaneamente (um único par de chamadas `pause()`/`resume()` no `MediaRecorder` de
    cada trilha, disparado pela mesma ação de UI), então um log por trilha só duplicaria o mesmo
    intervalo de tempo N vezes sem informação nova; um log em nível de sessão é o modelo mais
    simples que ainda captura tudo que a futura edição precisa (descartar trechos pausados).
33. **Pausar/retomar reaproveita a máquina de estados existente sem nenhuma alteração** —
    `RECORDING↔PAUSED`/`PAUSED→STOPPING` já eram transições válidas em `RECORDING_TRANSITIONS`
    desde o scaffolding da Fase 0 (nunca exercitadas por código real até este incremento);
    confirmado por inspeção antes de escrever qualquer lógica nova, evitando a tentação de
    reimplementar validação de transição que já existia.
34. **Timer de segmentação por tempo retoma com o tempo RESTANTE, não o total configurado de
    novo** — decisão deliberada para evitar um bug sutil: se `resume()` reagendasse o timer
    inteiro (ex.: 10 minutos) a cada vez, um segmento com pausas repetidas poderia crescer bem
    além do limite configurado antes de rotacionar, quebrando a garantia de tamanho/duração
    máxima que a segmentação existe para dar. `rotationTimerStartedAtRef`/
    `rotationTimerRemainingMsRef` (`useRecordingSession.ts`) guardam o tempo já decorrido por
    trilha para calcular o restante corretamente.
35. **Ordem "main primeiro, `MediaRecorder` local depois" em `pause()`/`resume()` do renderer** —
    evita precisar de um caminho de rollback: se o main rejeitar a transição (`InvalidRecordingTransitionError`,
    ex.: pausar uma gravação já pausada), o renderer nunca chega a pausar um `MediaRecorder` que
    precisaria ser revertido depois. Mesmo `withTrackLock` por trilha já usado para rotação de
    segmento é reaproveitado aqui, evitando corrida com uma rotação em andamento.
36. **`timestampMs` do marcador é tempo GRAVADO, descontando pausas fechadas** — mesmo raciocínio
    já aplicado ao cronômetro (`elapsedMs`) e ao timer de segmentação por tempo (decisão #34):
    `Date.now() - startedAtMs` menos a soma de `pauseIntervals` já fechados, para que o marcador
    aponte pro mesmo instante que o usuário via no indicador no momento do clique, mesmo após
    pausar/retomar antes.
37. **Marcador só permitido durante `RECORDING`, nunca `PAUSED`** — enquanto pausado o "instante
    atual" já está congelado (é sempre o mesmo desde que a pausa começou), então não há nada de
    novo pra marcar. Rejeitado explicitamente no main (`RecordingSessionManager.addMarker`); a UI
    reflete a mesma regra escondendo o botão (só aparece durante `status === 'recording'`).
38. **Canal de escrita (`recording.addMarker`) separado do de leitura (`markers.list`)** — criar
    um marcador depende da sessão ativa (fica em `recording.handlers.ts`, junto com
    start/stop/pause/resume); listar marcadores de um projeto não depende de sessão nenhuma
    (funciona durante ou depois da gravação), então vive em seu próprio domínio IPC
    (`markers.handlers.ts`) — o mesmo padrão de "domínio do canal segue o caso de uso, não
    necessariamente o gerenciador que o implementa" já usado por `project.openFolder` (decisão
    #27).
39. **Bug real: interop CJS/ESM do `check-disk-space` sob `externalizeDepsPlugin()` do
    electron-vite** — `import checkDiskSpace from 'check-disk-space'` compila no bundle do main
    para `require("check-disk-space")` sem desembrulhar `.default`, mas o pacote exporta
    `{default: fn, ...}`; chamar o objeto direto lança `TypeError: checkDiskSpace is not a
    function`. Já quebrava silenciosamente `system.getDiskSpace` (usado pelo `DiskSpaceIndicator`
    da Home) desde a Fase 0 — nenhum teste anterior exercitava o caminho real. Corrigido de forma
    defensiva (`typeof checkDiskSpaceImport === 'function' ? ... : ....default`), funcionando
    independente de bundler.
40. **Bug real: `contextBridge` do Electron não preserva `.name` nem propriedades customizadas de
    um `Error` cruzando do preload isolado pro renderer — só `.message` sobrevive** (achado
    empírico, dois rounds de teste diagnóstico temporário via piping de stdout/stderr do processo
    main e de `console.error` do renderer para o runner de teste). `IpcError` foi redesenhado para
    codificar o código como prefixo `[CODIGO] ` dentro de `.message`; `extractIpcErrorCode` no
    renderer extrai o prefixo de volta via regex — a única representação comprovadamente estável
    através da fronteira.
41. **`minimumFreeBytes` é opcional e resolvido pelo handler IPC, não lido internamente pelo
    `RecordingSessionManager`** — o manager não depende de `SettingsService`; omitir o parâmetro
    (como todos os testes unitários existentes fazem) pula a checagem inteiramente, mantendo os
    testes rápidos e determinísticos, desacoplados do estado real de disco.
42. **Limiares de disco lidos a cada tick de polling, não cacheados no início da sessão** —
    diferente da segmentação por tempo/tamanho (valores travados em refs no `start()`, decisão
    #29), um monitor de segurança deve reagir a uma mudança de configuração feita no meio de uma
    gravação em andamento.
43. **Limiar crítico faz dupla função**: piso mínimo pra começar a gravar (`start()`) E gatilho de
    auto-stop durante o monitoramento contínuo (`pollDiskSpace`) — mesmo número, duas checagens,
    evitando um terceiro valor de configuração sem necessidade real.
44. **Sem banner dedicado para o estado `critical`** — só existe o banner de `warning`; o estado
    crítico dispara quase imediatamente um `stop()` automático, cuja mensagem amigável chega pelo
    mesmo campo `error` já usado para falhas normais (via `autoStopReasonRef`, que sobrevive até o
    `setState` final de `stop()` e é resetado no `finally`).
45. **`retries: 2` + timeouts generosos (`DISK_SPACE_TEST_TIMEOUT_MS`/`DISK_CHECK_TEST_TIMEOUT_MS`)
    para os testes de disco** — mesma classe de flakiness ambiental já documentada para os testes
    de câmera (decisões #23/#31): o syscall real do `check-disk-space` (WMI no Windows) é
    ocasionalmente lento sob a carga cumulativa desta sessão de testes, não um bug de lógica (a
    lógica em si está provada correta e passou de forma limpa, sem nenhum retry, em múltiplas
    execuções completas da suíte).
46. **Reparo enumera segmentos a partir do BANCO, nunca do `manifest.json`** — achado registrado em
    detalhe na seção "Recuperação de gravações incompletas" acima: o manifest só é reescrito em
    pontos específicos (start/rotação/stop), então o segmento atualmente aberto de uma trilha que
    nunca rotacionou fica ausente dele até o próximo desses eventos. Usar o manifest como fonte de
    enumeração faria o reparo perder exatamente o caso mais comum de crash (durante o primeiro
    segmento). O manifest é reconstruído a partir do banco já corrigido ao final - vira
    consequência do reparo, não sua entrada.
47. **Validação de cada segmento é sempre contra o arquivo real no disco (`fs.stat`), nunca contra
    `byteSize` em cache** — nem o valor em memória do `RecordingSessionManager` (perdido no crash)
    nem o do banco (só atualizado em `markFinalized`, portanto também defasado para o segmento
    aberto no momento do crash) refletem com certeza quantos bytes sobreviveram; o arquivo em si é
    o único dado pós-crash confiável.
48. **Detecção (`detectIncomplete`) e reparo (`repair`) são deliberadamente duas operações
    separadas, não uma só** — detecção roda automaticamente e sem risco no boot (só flipa um campo
    de status, idempotente, nunca lança); reparo é uma ação explícita do usuário (clique em
    "Reparar" na Biblioteca) porque envolve decisões com efeito colateral real (descartar
    segmentos, apagar arquivos de 0 bytes) que não deveriam acontecer silenciosamente toda vez que
    o app abre.
49. **`repair()` rejeita qualquer projeto que não esteja `RECOVERABLE`** (`ValidationError`, nunca
    um no-op silencioso) — evita reparar acidentalmente duas vezes ou reparar um projeto saudável;
    força o fluxo a sempre passar pela detecção primeiro, mantendo uma única fonte de verdade sobre
    "o que precisa de reparo" (o campo `status`, não um cálculo ad-hoc repetido em outro lugar).
50. **Sem handler de `before-quit` que finalize uma sessão de gravação ativa** — decisão deliberada
    (não uma lacuna esquecida): tentar rodar uma finalização assíncrona (fechar arquivos, escrever
    manifest) durante o encerramento do processo é inerentemente arriscado (o próprio SO pode matar
    o processo antes de terminar); é mais robusto deixar a gravação "malformada" de propósito e
    reparar no próximo boot, onde há tempo e um banco consistente para decidir com calma - do que
    arriscar uma finalização apressada e potencialmente inconsistente durante o quit.
51. **`getProjectDetails` agrega a partir do banco (`segments.byteSize`), nunca escaneando o
    disco** — o banco já mantém o tamanho real de cada segmento finalizado (e o reparo, decisão
    #47, já garante que o `byteSize` reflita o arquivo real); um `fs.stat` por arquivo a cada vez
    que o usuário expande "Detalhes" seria trabalho redundante e mais lento sem nenhum ganho de
    precisão.
52. **Renomear/excluir reaproveitam a mesma lista de estados "sessão ativa" de
    `RecoveryService.INTERRUPTIBLE_STATES`, com um propósito diferente** — lá, esses estados
    encontrados no BOOT significam "processo anterior morreu, recuperar"; aqui, encontrados em
    tempo de execução normal, significam "gravação em andamento agora, bloquear a ação" (o
    `RecordingSessionManager` ainda tem arquivos abertos para este projeto).
53. **`deleteProject` remove o disco ANTES do banco, nunca ao contrário** — se `fs.rm` falhar (ex.:
    arquivo travado por outro processo), o projeto permanece visível/re-tentável na Biblioteca;
    inverter a ordem arriscaria um projeto "sumido" da lista com arquivos de mídia ainda ocupando
    disco em algum lugar, sem nenhum jeito de achá-los de novo pelo app.
54. **`library.spec.ts` é um arquivo E2E próprio, não mais uma seção de `recording.spec.ts`** —
    primeiro cenário desta suíte que não é "sobre gravação" (é sobre a tela da Biblioteca em si);
    registrado como o padrão daqui pra frente - um arquivo por área de produto, não um arquivo
    monolítico crescendo indefinidamente conforme o roadmap avança.
55. **`edit_projects.projectId` não é `UNIQUE`, então `editor.create` nunca é "abre se já
    existe"** — sempre cria um novo projeto de edição. Um botão "Editar" que fosse idempotente
    (reabrir o mesmo projeto de edição sempre) impediria o caso de uso explícito do modelo de
    dados: duas edições independentes da mesma gravação (ex.: "versão completa" vs. "versão
    curta" para redes sociais).
56. **Criar projeto de edição exige `status === 'COMPLETED'` na gravação** — mesmo raciocínio já
    registrado para renomear/excluir na Biblioteca (decisão #52): editar uma gravação ainda em
    andamento arriscaria arquivos ainda abertos pelo `RecordingSessionManager`; `RECOVERABLE`/
    `FAILED` precisam passar por reparo (ou aceitar a perda) antes de fazer sentido editar.
57. **A tela de detalhe do projeto de edição (`/editor/:id`) reaproveita `library.getDetails`
    (LIB-002) para mostrar um resumo da gravação vinculada** — em vez de duplicar a mesma lógica
    de agregação de trilhas/segmentos/bytes já testada e correta; o editor não precisa de uma
    visão diferente dos dados da gravação nesta etapa (sem timeline ainda).
58. **A timeline usa `project.startedAt` (início da SESSÃO) como âncora, não o início de cada
    segmento/trilha individualmente** — mesmo raciocínio já usado por marcadores/cronômetro
    durante a gravação (decisão #36): trilhas que começaram a gravar alguns ms depois uma da
    outra ficam alinhadas no mesmo referencial visual, nunca cada uma "começando do zero".
59. **Timeline compilada direto do banco (`tracks`/`segments`), nunca reescaneando o disco** —
    mesmo raciocínio de `getProjectDetails` (decisão #51): o banco já é a fonte confiável.
60. **Só segmentos `finalized` entram na timeline** — um segmento não finalizado só existiria
    aqui via bug (o reparo, RECOV-003, sempre finaliza ou descarta - nunca deixa
    `finalized: false` para trás); o filtro é defesa, não um caminho esperado no uso normal.
61. **Posicionamento da timeline por porcentagem (`left`/`width` relativos a `totalDurationMs`),
    não por pixel fixo** — responsivo à largura do container sem recalcular nada em JS ao
    redimensionar a janela; a régua usa intervalos "redondos" pré-definidos (1/2/5/10/15/30/60s
    etc.), nunca uma casa decimal de milissegundo ilegível.
62. **Esquema de protocolo customizado (`meeting-media://`), não `webSecurity: false` nem expor
    Node.js ao renderer** — as duas alternativas mais óbvias pra tocar mídia local em Electron são
    exatamente as duas coisas que este projeto proíbe por desenho (ver `secure-webpreferences.ts`/
    AGENTS.md); um `protocol.handle` que resolve `projectId` → `rootPath` real e valida o boundary
    é a única forma de servir os arquivos sem abrir mão de nenhuma das duas garantias.
63. **`registerSchemesAsPrivileged` no topo do módulo, `protocol.handle` só dentro de
    `bootstrap()`** — exigência do próprio Electron (o registro de privilégio precisa acontecer
    antes de `app.whenReady()`), mas o handler de fato precisa do `ProjectRepository` real, que só
    existe depois de `createAppContext()`. Duas chamadas, dois momentos, cada uma no ponto mais
    cedo possível em que tem tudo que precisa.
64. **Content-Type derivado da subpasta dentro de `source/`, nunca da extensão isolada** — todo
    segmento é sempre `.webm`, mas o container carrega vídeo+áudio (tela/câmera) ou só áudio
    (microfone/áudio do sistema); o navegador precisa do tipo certo pra decidir como decodificar.
65. **Validação em duas camadas antes de servir qualquer byte**: um filtro de FORMATO
    (`isValidMediaRelativePath`, regex que só aceita `source/<tipo>/<arquivo>.webm` exatamente)
    roda ANTES de qualquer acesso a banco/disco, em defesa profunda; `assertPathWithinBoundary`
    (já existente, reaproveitado) garante que o caminho final nunca escapa do `rootPath` do
    projeto - a mesma dupla camada já usada por `RecoveryService`/`ProjectService`.
66. **Preview desta etapa mostra só UMA trilha por vez, sem sincronizar múltiplas** —
    sincronização de playback entre até 4 trilhas simultâneas (cada uma potencialmente com
    múltiplos segmentos por rotação) é um desafio técnico grande o suficiente pra merecer seu
    próprio incremento; entregar "conseguir assistir/ouvir uma trilha" primeiro já é um salto real
    de valor (antes disso, só dava pra abrir a pasta no explorador de arquivos).
67. **Teste E2E do preview usa `videoWidth > 0`, não `duration`, como sinal de sucesso** — WebM
    produzido por `MediaRecorder` em chunks sucessivos costuma reportar `duration: Infinity` até o
    navegador escanear mais do stream (comportamento conhecido do Chromium com esse tipo de
    arquivo, não um bug deste app); `videoWidth > 0` só fica positivo depois que um frame real foi
    de fato decodificado, um sinal mais confiável de que o protocolo customizado funcionou de
    ponta a ponta.
68. **Relógio mestre em software (`requestAnimationFrame`/`performance.now()`), não o `timeupdate`
    de um elemento "líder"** — um elemento de mídia real para de disparar eventos justo na troca de
    `src` na fronteira de um clip, o momento mais crítico pra sincronizar as outras trilhas; um
    relógio independente, com correção por desvio (`isDrifting`, 250ms de tolerância) em vez de
    seek a cada frame, é mais robusto e evita micro-stutters visuais por correção excessiva.
69. **Lógica de sincronização extraída pura em `timeline-playback.ts`
    (`findClipAtTime`/`clipLocalTimeSeconds`/`isDrifting`/`msFromPointerOffset`), hook
    (`useMultiTrackPlayback.ts`) só orquestra** — mesmo padrão já usado por
    `segmentation-thresholds.ts`/`disk-space-thresholds.ts`: tudo que é decisão testável fica fora
    do que manipula `HTMLMediaElement`/`requestAnimationFrame` (difícil e de baixo valor mockar em
    Vitest).
70. **Todas as trilhas tocam simultaneamente, não só a exibida no preview** — trilhas de vídeo sem
    prioridade de exibição ficam com o elemento `hidden` (prontas para um futuro
    picture-in-picture, EDIT-011); trilhas de áudio nunca têm elemento visual, mas tocam
    normalmente - o valor de ter múltiplas trilhas de áudio gravadas separadamente é justamente
    reconstituir o áudio completo da reunião na reprodução, não só uma trilha isolada.
71. **Playhead desenhado dentro de cada lane/régua (mesma referência de largura que os próprios
    marcos/clips daquele elemento), não uma linha absoluta sobre o componente `Timeline` inteiro**
    — a régua não reserva a coluna do rótulo da trilha (110px) como as lanes reservam, então tem
    largura diferente; desenhar por elemento evita medir qualquer coisa em JS, mantendo o
    princípio 100%-porcentagem já registrado na decisão #61.
72. **Reset do estado do player via `key={editProject.id}` no componente pai, não um `useEffect`
    chamando `setState`** — o padrão recomendado pelo React pra "resetar estado quando um id muda"
    é remontar a subárvore; evita o anti-padrão de setState síncrono dentro de um efeito
    (`react-hooks/set-state-in-effect`) e deixa o reset atômico.
73. **Buscar (seek) só por clique/toque na régua ou numa lane de trilha, sem arrastar o mouse
    pressionado (drag-scrub) nem atalhos de teclado** — suficiente para navegar no tempo durante
    esta etapa; um scrubber arrastável e atalhos (espaço = play/pause, setas = ±1 frame) ficam para
    um refinamento futuro, não bloqueante para o MVP do editor.
74. **Bug real encontrado e corrigido durante este incremento: `findClipAtTime(clips, 0)` no
    instante 0 nunca encontrava clip nenhum.** Cada trilha abre seu primeiro segmento alguns
    milissegundos DEPOIS do instante 0 da sessão (mesmo atraso assíncrono já documentado na
    timeline somente-leitura, EDIT-002 - `clip.startMs` quase nunca é exatamente `0`). O
    pré-carregamento do primeiro frame (`useMultiTrackPlayback`, ao montar) chamava
    `findClipAtTime(clips, 0)`, que retornava `null` porque `0 >= clip.startMs` era falso -
    `el.src` nunca era atribuído, e o preview ficava pra sempre sem nenhum frame decodificado
    (sintoma: timeout indefinido em `videoWidth > 0`, não flakiness recuperável por retry).
    Corrigido fazendo `findClipAtTime` retornar o PRIMEIRO clip quando o instante pedido é ANTES
    dele (em vez de `null`) - só um gap real ENTRE dois clips, ou depois do último, continua
    retornando `null`. Descoberto ao investigar por que o teste E2E de preview (não tocado por
    este incremento) também passou a falhar - mesmo sintoma nos dois testes, mesma causa raiz,
    não duas instâncias da flakiness ambiental já documentada (decisão #23).
75. **Trim/split/delete-range são o MESMO primitivo (`REMOVE_RANGE`), não três operações
    diferentes no schema** — `05_MEDIA_EDITOR.md` §6 já mostra `REMOVE_RANGE` como a operação de
    corte no modelo de edição; "trim inicio" é só `REMOVE_RANGE(0, X)`, "trim fim" é
    `REMOVE_RANGE(X, totalDurationMs)`, e "split + apagar o meio" é uma seleção arbitrária no
    meio da timeline - a UI oferece atalhos diferentes (botões de trim vs. marcar seleção
    manualmente) para o MESMO canal IPC, em vez de multiplicar tipos de operação sem necessidade
    real ainda.
76. **`edit_operations.startMs`/`endMs` são relativos à timeline JÁ EDITADA no momento da
    criação, não à bruta original** — `removeRange()` sempre valida e opera sobre
    `getEditedTimeline()` (o estado atual, com as operações anteriores já aplicadas), nunca sobre
    `getTimeline()` diretamente. Um segundo corte "empurra" a partir do resultado do primeiro -
    o mesmo referencial que o usuário via na tela ao criar aquela operação especificamente
    (padrão de "histórico incremental" já sugerido por `05_MEDIA_EDITOR.md` §7 para undo/redo,
    ainda não implementado).
77. **Algoritmo de corte extraído puro (`main/services/apply-remove-range.ts`), sem nenhum import
    de `electron`** — mesmo padrão já usado em todo o projeto para lógica testável isoladamente
    (`segmentation-thresholds.ts`, `timeline-playback.ts`). `EditorService.getEditedTimeline()`
    só orquestra: busca a timeline bruta, aplica cada operação do log em sequência, filtra
    trilhas que ficaram sem nenhum clip.
78. **Novo campo `sourceStartMs` em `TimelineClip`** — offset (ms) DENTRO DO ARQUIVO de origem
    onde o conteúdo de um clip começa; sempre `0` na timeline bruta (todo segmento é usado do
    próprio início), mas pode ser maior depois que um `REMOVE_RANGE` corta a CABEÇA de um clip -
    a parte que sobra ainda referencia o mesmo arquivo, só começando mais adiante nele. Sem esse
    campo, o player não teria como saber ONDE no arquivo buscar depois de um corte no meio de um
    clip, só por QUANTO TEMPO tocar.
79. **Um corte no MEIO de um clip o divide em dois** (mesmo `segmentId`/`relativePath`, janelas
    de tempo e `sourceStartMs` diferentes) — consequência direta do modelo anterior, não uma
    decisão isolada. Quebra a suposição implícita de que `segmentId` é único por trilha (válida
    até este incremento); a `key` do React na `Timeline` passou a ser `${segmentId}-${startMs}`
    (startMs é garantido único entre clips da mesma trilha, já que não se sobrepõem por
    construção).
80. **Depois de qualquer corte bem-sucedido, o player salta para o início
    (`playback.seek(0)`)** — o instante em que o usuário estava pode nem existir mais na timeline
    mais curta (ou estar bem no meio do trecho que acabou de ser removido); saltar pro início é
    previsível e é o mesmo comportamento de editores de vídeo convencionais depois de um corte,
    em vez de tentar preservar uma posição que pode ser inválida.
81. **Estado editável da timeline vive DENTRO de `EditorProjectView` (sincronizado da prop via
    ajuste durante a renderização, não um `useEffect` chamando `setState`), não em
    `EditorProjectPage`** — `removeRange` precisa poder SUBSTITUIR a timeline exibida pela
    resposta já recalculada do IPC sem depender do componente pai refazer o fetch inteiro; o
    padrão de "ajustar estado durante a renderização comparando com a última prop vista" é o
    recomendado pelo próprio React para derivar estado de uma prop que muda, evitando o mesmo
    anti-padrão (`react-hooks/set-state-in-effect`) já registrado na decisão #72.
82. **Bug real encontrado e corrigido durante a validação E2E: `playback.playheadMs` chegava
    FRACIONÁRIO (`performance.now()` tem sub-milissegundo de precisão) onde `startMs`/`endMs` de
    `removeRange` exigem inteiro (`RemoveRangeRequestSchema`)** — clicar em "Cortar antes daqui"
    durante a reprodução enviava um `endMs` fracionário, a validação Zod rejeitava na fronteira
    do IPC, e o botão nunca voltava a ficar desabilitado (reproduzido de forma CONSISTENTE em 3
    tentativas seguidas, não uma flakiness ambiental qualquer - o sinal de que era um bug real,
    não sorte ruim). Corrigido arredondando uma única vez na origem (dentro de `setPlayheadMs`,
    no hook) - poupa todo consumidor futuro (seleção manual, futuros atalhos de teclado) de
    lembrar disso individualmente.
83. **Desfazer/refazer movem um CURSOR (`edit_projects.activeOperationSequence`) sobre o log
    existente, nunca apagam uma operação** — `edit_operations` já era um log ordenado e imutável
    desde EDIT-004/005/006; um cursor de posição é a extensão mínima pra suportar undo/redo sem
    reescrever nada do que já funcionava, e mantém a auditoria completa de tudo que já foi feito
    (mesmo o que está temporariamente "desfeito").
84. **Criar uma operação nova depois de um undo poda fisicamente (`DELETE`) qualquer coisa além
    do cursor, ANTES de inserir** — comportamento padrão de qualquer editor: uma ação nova
    invalida o "refazer" pendente. Podar de verdade (em vez de só deixar `activeOperationSequence`
    pra trás e as linhas orfãs no banco) evita ambiguidade de `sequence` duplicado quando a
    próxima operação é criada com `sequence = activeOperationSequence + 1`.
85. **`GetEditedTimelineResponse` carrega `canUndo`/`canRedo` prontos, em vez de expor
    `activeOperationSequence`/contagem de operações pra UI deduzir sozinha** — a mesma lógica
    (`sequence > 0` / `sequence < total`) só precisa existir uma vez, no `EditorService`; a UI só
    lê dois booleanos.
86. **Primeira migration real do projeto além da inicial** (`0001_cynical_jamie_braddock.sql`,
    gerada via `pnpm db:generate`) — todo o schema anterior coube na migration `0000` (Fase 0);
    `activeOperationSequence` é o primeiro campo adicionado a uma tabela já existente em produção,
    confirmando que o pipeline de migrations versionadas (nunca `db:push` em runtime, ver
    `main/database/migrate.ts`) funciona corretamente incrementalmente, não só no bootstrap.
87. **Atalhos Ctrl+Z/Ctrl+Shift+Z num listener global (`window.addEventListener('keydown', ...)`),
    com guard de foco em campo de texto MESMO SEM nenhum campo de texto existir ainda nesta
    tela** — `05_MEDIA_EDITOR.md` §15 exige o guard para todos os atalhos do editor; implementar
    agora (em vez de esperar o primeiro campo de texto real, ex.: renomear o projeto de edição
    inline) evita esquecer depois e documenta a intenção explicitamente.
88. **Estado de "operação em andamento" (`busy`) e erro (`actionError`) compartilhados entre
    corte, undo e redo** — os três são a mesma categoria de ação (uma mutação da timeline editada
    via IPC, seguida de `playback.seek(0)`); um helper único (`applyTimelineMutation`) evita
    triplicar a lógica de "atualiza timeline + limpa seleção + resincroniza o player" nos três
    handlers.
89. **`SET_GAIN` reusa o log de `edit_operations` do EDIT-007 sem nenhuma tabela/coluna nova** —
    `trackId`/`payloadJson` já existiam desde a Fase 0 comentados especificamente para isto;
    ganho/mudo herdam undo/redo/poda-de-ramo de graça em vez de precisar de uma implementação
    paralela.
90. **`SET_GAIN` SUBSTITUI o estado da trilha, não acumula** (diferente de `REMOVE_RANGE`,
    que sempre se compõe sobre o resultado da operação anterior) — ajustar volume é um estado
    atual da trilha, não uma transformação cumulativa; o fold em `getEditedTimeline` sobrescreve
    a cada ocorrência ativa em vez de somar.
91. **`gainDb` limitado a [-60, 0], sem amplificação** — os elementos `<video>`/`<audio>` nativos
    usados pelo player só suportam `volume` linear 0..1; amplificar acima do original exigiria
    Web Audio API (`GainNode`), fora do escopo deste incremento (registrado como pendência).
92. **`muted` e `gainDb` são campos independentes**, mesma semântica de
    `HTMLMediaElement.muted`/`.volume` — alternar mudo preserva o ganho ajustado, sem lógica extra
    de "lembrar" o volume anterior.
93. **`setTrackGain` não usa `applyTimelineMutation`/`busy`** — ajustar ganho não invalida o
    playhead/seleção (ao contrário de corte/undo/redo, que podem reestruturar a timeline), e um
    slider de range dispara eventos rápidos demais para o padrão de `busy` global fazer sentido;
    um guard de sequência (`gainRequestSeqRef`) descarta respostas IPC desatualizadas em vez disso.
94. **`SET_FADE` é um terceiro tipo de operação independente de `SET_GAIN`**, não um campo a mais
    no mesmo payload — uma trilha pode ter ambas ativas simultaneamente (fold em
    `getEditedTimeline` roda as duas passagens sem interferência mútua), evitando acoplar dois
    conceitos de mixagem que o usuário ajusta em momentos diferentes.
95. **Fade recalcula o volume a cada tick de reprodução, não só quando a timeline muda** (ao
    contrário de ganho/mudo, que é estático) — o multiplicador depende da posição atual do
    playhead relativa ao início/fim da trilha; isso exigiu mover o cálculo pra dentro de
    `applyTimeToTrack` (já chamada a cada frame + seek) em vez de um `useEffect` isolado.
96. **`fadeVolumeMultiplier` combina fade-in/fade-out via `Math.min`**, nunca soma nem multiplica
    as duas rampas — garante que o resultado nunca excede 1 e que numa trilha curta (onde as duas
    janelas se sobrepõem) o multiplicador mais silencioso sempre vence, sem casos especiais.
97. **Volume final = `dbToLinearVolume(gainDb) × fadeVolumeMultiplier(...)`** — os efeitos do
    EDIT-008 e do EDIT-009 compõem multiplicativamente no ponto de aplicação (`applyTimeToTrack`),
    sem nenhuma coordenação especial entre os dois fold passes que os calculam.
98. **`cameraTransform` é `null` pra qualquer trilha que não seja `CAMERA`** — posição/tamanho não
    tem significado pra áudio, e a trilha de tela é sempre o fundo do preview (preenche o canvas
    inteiro), nunca um overlay posicionável; `setTrackTransform` rejeita explicitamente qualquer
    `trackId` de outro tipo, a primeira restrição de TIPO de trilha (não só de existência) entre as
    operações do log.
99. **Toda trilha `CAMERA` nasce com uma posição PiP padrão** (`DEFAULT_CAMERA_TRANSFORM`) em vez
    de `null`/zero — mesmo raciocínio de `gainDb: 0`/`fadeInMs: 0`: um "estado neutro" sempre
    presente, nunca ausente só porque nenhum ajuste foi feito ainda.
100. **A trilha de overlay (câmera sobreposta) é sempre distinta da trilha de fundo** —
     `pickOverlayCameraTrack` retorna `null` quando a câmera É a própria trilha de fundo escolhida
     por `pickPreviewTrack` (gravação só de câmera, sem tela) — não faz sentido desenhar uma trilha
     sobreposta a si mesma; o comportamento pré-EDIT-010 (câmera em tela cheia sem overlay) é
     preservado intacto nesse caso.
101. **O preview reaproveita os elementos `<video>` já montados desde o EDIT-003 parte 2**
     (`useMultiTrackPlayback` já tocava TODAS as trilhas em lockstep) — só a exibição visual (qual
     fica `hidden`, `position: absolute` vs. fluxo normal) mudou; nenhuma mudança no motor de
     reprodução foi necessária para adicionar o overlay PiP.
102. **`SET_LAYOUT` mira a composição inteira (`trackId: null`), não uma trilha** — layout não é
     uma propriedade de uma trilha específica (`05_MEDIA_EDITOR.md` §2 "Composition"), ao contrário
     de TODAS as operações anteriores do log (ganho, fade, transformação de câmera). Reusa o mesmo
     padrão de `REMOVE_RANGE`, que já não mirava trilha nenhuma.
103. **`layoutPreset` só existe na timeline EDITADA, nunca na bruta** — mesmo raciocínio de
     `canUndo`/`canRedo`: layout é um conceito de EDIÇÃO, não algo compilado a partir dos
     segmentos gravados em si.
104. **`setLayoutPreset` não valida quais trilhas existem na gravação** — ao contrário de
     `setTrackTransform` (rejeita trilha que não é CAMERA), qualquer um dos 4 presets é sempre
     válido de gravar no log; a decisão de "o que fazer quando o preset não pode ser satisfeito"
     fica inteiramente no RENDERER (`computePreviewLayout`), evitando duplicar essa lógica de
     fallback no backend também.
105. **`computePreviewLayout` cai de volta pro comportamento `PIP` automático quando o preset
     escolhido não tem as trilhas necessárias** (`CAMERA_ONLY` sem câmera, `SIDE_BY_SIDE` sem
     ambas) — nunca mostra uma tela em branco só porque o preset pedido não faz sentido para esta
     gravação específica; reusa `pickPreviewTrack`/`pickOverlayCameraTrack` internamente em vez de
     duplicar a lógica de fallback.
106. **`appendOperation` envolve suas três escritas (`deleteAfterSequence`/`create`/
     `touchAfterEdit`) numa única transação SQLite** — antes do EDIT-012 eram três `.run()`
     independentes; um crash entre `create` e `touchAfterEdit` deixava uma operação gravada no
     banco mas invisível pro cursor, perdendo silenciosamente a última edição do usuário. Com a
     transação, ou tudo commita junto ou nada commita.
107. **`EditorService` passou a receber o `AppDatabase` bruto, não só os repositórios** — único
     jeito de `appendOperation` orquestrar uma transação abrangendo chamadas de DOIS repositórios
     diferentes (`EditOperationRepository` e `EditProjectRepository`), que compartilham a mesma
     conexão SQLite mas não têm nenhuma forma própria de coordenar uma transação entre si.
108. **Indicador de dirty-state usa um CONTADOR (`pendingSaves`), não um booleano** — várias
     mutações podem estar em voo simultaneamente (ex.: um slider de ganho arrastado enquanto uma
     troca de layout anterior ainda não voltou); só mostra "tudo salvo" quando NENHUMA está
     pendente, evitando um falso "salvo" no meio de duas chamadas concorrentes.
109. **Sem debounce/coalescência de operações de arrasto neste incremento** — um arrasto de slider
     continua gerando uma operação por evento `input`, igual antes do EDIT-012; considerado fora
     do escopo mínimo de "autosave = nunca perder trabalho" (a garantia de atomicidade já cobre o
     caso real de perda de dados), registrado como refinamento futuro em vez de arriscar um ajuste
     não totalmente testado nos sete handlers existentes.
110. **`pickPreviewTrack`/`pickOverlayCameraTrack`/`computePreviewLayout`/`dbToLinearVolume`
     movidas de `renderer/` para `shared/media/`** — o render plan (`main/`) precisa da EXATA
     mesma lógica de composição de layout e conversão de ganho que o preview ao vivo (`renderer/`)
     já usa; reusar a MESMA função pura dos dois lados garante por construção que o vídeo
     exportado nunca diverge do que o usuário viu no editor. `tsconfig.node.json`/`tsconfig.web.
     json` já incluíam `src/shared/**/*.ts` desde a Fase 0 - mudança só de pasta, zero ajuste de
     build.
111. **`RenderPlan` é uma estrutura de DADOS ("Timeline Compiler"), não um comando FFmpeg** — o
     "FFmpeg Plan" (tradução pra argumentos reais de linha de comando) fica pra um incremento
     seguinte; a doc é explícita sobre isso ("Não gerar comandos FFmpeg diretamente a partir dos
     componentes React" - a camada intermediária existe justamente pra essa separação de
     responsabilidade).
112. **`buildRenderPlan` filtra trilhas não-vídeo antes de virarem `background`/`overlay`/
     `sideBySideRight`** — `computePreviewLayout` pode legitimamente apontar pra uma trilha de
     ÁUDIO como "single" quando a gravação não tem vídeo nenhum (comportamento correto pro
     preview, que só desenha vídeo mesmo); deixar isso vazar pro render plan confundiria um futuro
     construtor de comando FFmpeg.
113. **`ffmpeg-static`/`ffprobe-static` aprovados via `pnpm approve-builds`, registrado em
     `pnpm-workspace.yaml`** — mesmo padrão já usado pro `better-sqlite3` (dependência nativa que
     precisa rodar um script de instalação); a aprovação persiste pra qualquer `pnpm install`
     futuro sem exigir intervenção manual de novo.
114. **`resolveFfmpegBinaries` prioriza override > variável de ambiente > pacote `-static`
     instalado** — a variável de ambiente (`MEETING_STUDIO_FFMPEG_PATH`/`_FFPROBE_PATH`) existe
     desde a Fase 0 mas só ganhou um consumidor real de fato relevante agora - útil pra apontar um
     binário diferente em CI/empacotamento futuro sem precisar reconstruir o app.
115. **`runFfmpegProcess` retorna `{ result, cancel }` em vez de só uma Promise** — progresso
     (EXP-007) e cancelamento (EXP-008) entregues na MESMA passada que a conexão do binário real
     (EXP-002) porque são a mesma infraestrutura de processo (spawn + stdout/stderr + kill);
     `onProgress` só dispara se o CHAMADOR incluir `-progress pipe:1` nos próprios `args` - o
     wrapper nunca injeta flags que o chamador não pediu.
116. **`buildFfmpegArgs` retorna `null` (não lança) pra um plano fora do escopo (PiP/lado-a-lado)**
     — mesmo padrão de função pura sem exceção já usado por `buildRenderPlan`; o CHAMADOR
     (`ExportService`) decide como reagir (hoje: rejeita a exportação com `ValidationError` e uma
     mensagem clara), mantendo a função de tradução testável isoladamente sem precisar simular
     nenhum estado de erro específico do domínio.
117. **`ExportService.startExport` é fire-and-forget de propósito** — enfileira o job e dispara
     `void exportJobRunner.run(...)` SEM aguardar; o handler IPC devolve o job `QUEUED`/`RUNNING`
     imediatamente. Consequência observável (coberta num comentário de teste): como `JobRunner.run`
     é uma função `async` cujo corpo roda SINCRONAMENTE até o primeiro `await` real (dentro de
     `runFfmpegProcess`, depois do `spawn` já ter acontecido), o status já pode estar `RUNNING` no
     instante em que `startExport` retorna - nunca um jeito confiável de observar `QUEUED` de fora.
118. **`JobRunner.transition` ganhou um `extraPatch` opcional, fundindo `status` + `result`/`error`/
     `completedAt` numa ÚNICA chamada a `store.update`** — bug real corrigido (ver seção acima);
     qualquer `JobStore` que precise ver o status final e o resultado JUNTOS (como
     `ExportJobStore`) agora recebe os dois de uma vez, não em duas chamadas separadas.
119. **`buildRenderPlan.audio` exclui CAMERA/SCREEN mesmo não-mutadas** — bug real corrigido (ver
     seção acima); só MICROPHONE/SYSTEM_AUDIO entram no mix de áudio, as duas únicas trilhas que
     este app efetivamente captura com áudio embutido.
120. **Nome do arquivo exportado usa resolução + timestamp (`export_<res>_<epoch>.mp4`), não o
     nome/título da gravação** — simples e sem colisão entre exportações consecutivas; um nome
     amigável baseado no título fica como refinamento futuro de UX, não bloqueante.
121. **`StartExportRequestSchema.target` é uma união discriminada (`kind: 'VIDEO' | 'AUDIO'`), não
     um campo `resolution` opcional + um campo `format` opcional** — a união torna IMPOSSÍVEL, no
     nível de tipo, pedir os dois ao mesmo tempo ou nenhum dos dois; um par de campos opcionais
     exigiria validação runtime pra garantir exclusividade mútua, que o Zod `discriminatedUnion`
     já garante de graça.
122. **`buildAudioMixFilter` extraída como função compartilhada entre `buildFfmpegArgs` e
     `buildAudioFfmpegArgs`** — a MESMA lógica de trim/concat/volume/afade/amix por trilha de
     áudio, só o destino final (mapeada como trilha extra de um MP4 vs. sendo o arquivo de saída
     inteiro) e o codec diferem; evita duas implementações que poderiam divergir silenciosamente
     (o mesmo raciocínio já usado pra mover `computePreviewLayout`/`dbToLinearVolume` pra
     `shared/` no EXP-001).
123. **WAV usa `pcm_s16le` sem `-b:a`** — PCM linear não tem bitrate configurável (é sempre
     `sample_rate × bit_depth × canais`); passar `-b:a` a um codec PCM é um no-op silencioso do
     FFmpeg, omitido deliberadamente pra não sugerir uma opção que não faz nada.
124. **`buildRenderPlan.resolution` tornou-se opcional** — uma exportação só de áudio nunca
     precisa de `width`/`height`; em vez de duplicar `RenderPlan`/`buildRenderPlan` num "modo
     vídeo" e "modo áudio" separados, a mesma função sempre produz a MESMA estrutura completa
     (incluindo `background`/`overlay` computados, mesmo que descartados no caminho de áudio) -
     `output.width`/`height` ficam `0` quando `resolution` é omitido, nunca lidos por
     `buildAudioFfmpegArgs`.
125. **Sem checagem de capabilities do FFmpeg em runtime pra MP3** — `libmp3lame` é confirmado
     presente no build `ffmpeg-static` instalado (`ffmpeg -version`), então `AudioExportFormatSchema`
     inclui `MP3` incondicionalmente; um fork que trocasse o binário por um sem esse codec só
     descobriria o problema no `stderr` do processo FFmpeg (`FFmpeg falhou (código N): ...`, já
     capturado e propagado como `job.error`), não numa checagem antecipada - aceitável dado que
     este app sempre controla qual binário instala.
126. **UI de faixa de tempo (EXP-006) reusa a `selection` já existente (EDIT-004/005/006), não um
     controle dedicado** — o usuário já tem uma forma de marcar um intervalo na tela pra
     trim/remover; exportar só ele é só mais um consumidor da mesma marcação, evitando duplicar
     estado/UI pra um conceito que já existe.
127. **`ExportService` valida `rangeMs` (contra `totalDurationMs`), o schema só valida `startMs <
     endMs`** — mesma separação de responsabilidade já usada em `removeRange`/`RemoveRangeRequestSchema`:
     o schema nunca conhece a duração real de uma timeline específica, então validação que depende
     de estado (não só da forma dos dados) sempre vive no serviço, nunca no schema.
128. **`ExportService.cancelExport` mata o processo real E move o job pra `CANCELED`, nunca só
     uma das duas** — matar só o processo deixaria o job preso em `RUNNING` pra sempre (o handler
     que marcaria `COMPLETED`/`FAILED` nunca roda de novo); mudar só o status deixaria um FFmpeg
     real rodando em segundo plano gravando um arquivo que ninguém mais vai usar. Rastreado via um
     `Map<string, () => void>` privado (`activeCancelFns`) populado com `handle.cancel` (de
     `runFfmpegProcess`) assim que o processo é spawnado, removido num `finally` logo após
     `handle.result` resolver — nunca fica uma referência "órfã" apontando pra um processo já
     morto.
129. **`JobRunner.run()` re-busca o status real do job antes de CADA transição final, não confia na
     variável `record` local capturada no início** — bug de corrida encontrado por raciocínio de
     design (não por um teste falhando): `JobStore.get(id)` sempre devolve um objeto NOVO a cada
     chamada, então uma mutação feita por um `cancel()` concorrente nunca é visível pela variável
     `record` original. Sem a re-busca, `run()` tentaria `CANCELED -> COMPLETED`/`CANCELED ->
     FAILED` (transições inválidas, estado terminal) pra um cenário que na verdade já estava
     correto — só o handler terminando DEPOIS do cancelamento tentava sobrescrevê-lo.
130. **`cancelExport` é idempotente por design — cancelar um job já terminal é um no-op silencioso,
     não um erro** — a UI pode legitimamente clicar "cancelar" bem no instante em que o job termina
     por conta própria (corrida natural do timing real, não um bug); nunca deveria virar um erro
     visível pro usuário só por causa disso.
131. **Canal IPC `export.cancel` novo, não uma flag em `export.start`** — cancelar é uma operação
     logicamente distinta de iniciar (opera sobre um job já enfileirado, identificado por `id`),
     mesmo raciocínio já usado pra outros pares início/interrupção deste app (`recording.start`/
     `.stop`, `recording.pause`/`.resume`).
132. **`runFfprobeProcess` é um wrapper de processo separado de `runFfmpegProcess`, não
     reaproveitado** — ffprobe nunca escreve num arquivo de mídia; a saída que importa é o JSON
     INTEIRO acumulado em stdout, bem diferente do progresso incremental `-progress pipe:1` do
     FFmpeg (onde só a última linha `out_time_us=` de cada chunk importa). Forçar os dois pelo
     mesmo wrapper exigiria uma flag "acumular tudo" vs. "processar linha a linha e descartar" -
     mais confuso que duas funções pequenas e diretas.
133. **`validateFfprobeOutput` é uma função pura (nenhum spawn, nenhum I/O)** — testável
     isoladamente com strings JSON fabricadas em vez de precisar rodar um ffprobe real pra cada
     caso de borda (JSON inválido, zero streams, duração ausente/zero/não-numérica). Mesmo
     princípio de separação já usado em `buildFfmpegArgs`/`buildRenderPlan` - lógica de decisão
     pura, separada do wrapper de processo que produz a entrada dela.
134. **`ExportService.startExport` roda o ffprobe REAL contra o próprio `outputPath` antes de
     aceitar o resultado do FFmpeg como sucesso** — `exitCode 0` sozinho nunca provava que o
     arquivo escrito é utilizável de verdade (um encode com zero frames de verdade ainda pode
     sair com `exitCode 0` em casos de borda). Um `throw` na validação é capturado por
     `JobRunner.run()` exatamente como qualquer outra falha do handler, marcando o job `FAILED`
     (nunca `COMPLETED`) com o motivo exato — reaproveitando o mesmo mecanismo de tratamento de
     erro já usado pelo caminho `result.exitCode !== 0`, sem um branch especial.
135. **`ExportService` ganhou um construtor opcional `ffmpegBinaryOverrides`, existe só pra
     teste** — permite apontar o `ffprobePath` pra um binário propositalmente quebrado sem
     precisar de uma variável de ambiente global (`MEETING_STUDIO_FFPROBE_PATH`), que vazaria pra
     qualquer outro teste rodando em paralelo no mesmo processo Vitest. Em produção,
     `app-context.ts` nunca passa esse parâmetro - sempre resolve os binários reais.
136. **`buildConcatVideoLabel` extraído das três camadas de vídeo possíveis (`background`,
     `overlay`, `sideBySideRight`) — mesma lógica de trim+concat, só o rótulo de saída muda** —
     antes deste incremento só existia inline pra `background`; PiP/lado-a-lado precisavam da
     MESMA operação pra uma segunda camada, então extrair evitou triplicar o mesmo `map`+`concat`.
     As três camadas compartilham exatamente a mesma forma (`RenderVideoLayer`), então uma única
     função genérica bastou, sem nenhum parâmetro condicional por camada.
137. **PiP usa "cover" (`scale`+`crop`), lado-a-lado usa "contain" (`scale`+`pad`)** — escolha
     deliberada espelhando o CSS real do preview ao vivo: `.editor-preview-overlay` (EDIT-010) usa
     `object-fit: cover`, o layout `SIDE_BY_SIDE` (EDIT-011) não força nenhum `object-fit`. Manter
     os dois comportamentos consistentes entre preview e export era o ponto inteiro deste
     incremento - divergir teria recriado o mesmo tipo de "bug de confiança" já evitado desde
     EXP-001 (mover `computePreviewLayout` pra `shared/`).
138. **`overlay=...:eof_action=pass`, não o `repeat` padrão do FFmpeg** — se a trilha da câmera
     terminar antes da trilha de fundo, o overlay desaparece dali em diante em vez de congelar o
     último quadro pra sempre por cima do fundo (o comportamento padrão do FFmpeg) - um resultado
     visualmente correto sem exigir nenhuma lógica adicional de "quando parar de mostrar".
139. **`shape: 'circle'` continua sendo uma aproximação retangular no arquivo exportado, mesma
     limitação já aceita no preview desde EDIT-010** — um recorte circular real exigiria um filtro
     `geq`/`alphamerge` mascarando o canal alfa por coordenada, complexidade desproporcional ao
     valor pra este incremento; documentado como pendência, não escondido.
140. **Verificação de PiP/lado-a-lado via dimensão exata do arquivo de saída (ffprobe real), não
     inspeção de pixels** — confirmar que a saída tem EXATAMENTE `WxH` (1280×720 pedido) só é
     alcançável se o `overlay`/`hstack` gerado for sintaticamente válido E executado com sucesso
     pelo FFmpeg real - suficiente pra provar que a composição funciona de ponta a ponta, sem
     precisar decodificar frames individualmente pra comparar pixels (custo desproporcional ao que
     esta verificação precisa provar).
141. **Título/nota do marcador preenchidos ANTES do clique em "Marcador", não num modal
     bloqueante depois** — dois campos de texto opcionais ficam visíveis ao lado do botão durante
     gravação ativa; o clique captura o marcador com o que estiver digitado naquele instante e
     limpa os campos. Um modal pós-clique interromperia visualmente a gravação ao vivo (a tela
     escureceria/travaria por trás de um diálogo) pelo tempo que o usuário levasse pra digitar -
     inaceitável pro caso de uso real de um marcador (capturar um instante RAPIDAMENTE, sem perder
     o fio da reunião).
142. **Refinamento de marcadores (título/nota + visualização) não tocou schema/IPC/repositório -
     só UI** — `AddMarkerRequestSchema`/`markers.list` já suportavam tudo que faltava desde
     RF-016 (Fase 1); o gap identificado era inteiramente de superfície (nenhuma UI preenchendo
     `title`/`note` na hora de criar, nenhuma UI consumindo `markers.list` depois). Confirmar isso
     por leitura de código ANTES de escrever qualquer linha evitou trabalho de backend
     desnecessário - mesmo raciocínio já usado em EXP-007 (progresso de exportação, que também já
     estava pronto e só precisava ser descoberto, não construído).
143. **Busca de marcadores separada da busca de detalhes na Biblioteca (`markers.list` +
     `library.getDetails`, duas chamadas independentes)** — uma falha ao buscar marcadores não
     deveria impedir o resto dos detalhes (duração/trilhas/tamanho) de aparecer; `markers` cai
     pra `[]` nesse caso (renderiza "Nenhum marcador nesta gravação" em vez de propagar o erro pra
     a seção inteira) - os dois conjuntos de dados são logicamente independentes, então uma falha
     num não devia contaminar o outro.
144. **`TranscriptionService` não recebe (nem finge receber) nenhum `TranscriptionProvider` real
     nesta fase — sem parâmetro construtor opcional "meio conectado"** — o handler do job sempre
     lança um único erro claro, incondicional; considerado e descartado um design alternativo com
     um parâmetro `provider?: TranscriptionProvider` no construtor (permitiria testar o caminho de
     sucesso injetando um fake) por introduzir codepath morto em produção (nunca preenchido em
     `app-context.ts`) sem ganho real - os testes de sucesso da leitura (`getTranscript`) já
     semeiam dados diretamente via `TranscriptRepository`, sem precisar de um provedor fake.
145. **Três tabelas (`transcription_jobs`/`transcripts`/`transcript_segments`), não uma
     tabela de job genérica reaproveitando `export_jobs`** — os dois tipos de job têm resultados
     de natureza diferente (um arquivo em disco vs. linhas de banco consultáveis), e as fases
     futuras de busca (Fase 7) precisam consultar segmentos de transcrição diretamente via SQL -
     forçar os dois tipos numa tabela polimórfica só complicaria ambos sem necessidade real.
146. **`buildTranscriptEntities` extraída como função pura e testada isoladamente, mesmo sem
     nenhum chamador em produção nesta fase** — mesmo princípio já usado por `computeExportProgress`
     (EXP-002, testado antes de `ExportService` sequer existir): lógica de mapeamento/geração de id
     pura é segura de entregar e testar ANTES do pipeline completo que vai chamá-la existir,
     reduzindo o escopo do incremento que a conecta de verdade (AI-002).
147. **UI de transcrição vive na Biblioteca (detalhes expandidos), não no Editor** — transcrição é
     uma propriedade da GRAVAÇÃO crua (`Transcript.projectId`), não do projeto de edição
     (`editProjectId`); colocar o botão "Transcrever" no Editor obrigaria o usuário a criar um
     projeto de edição só para transcrever, uma dependência artificial que a doc não pede.

## Testes

- **Vitest** (`tests/unit/`): máquina de estados de gravação e de jobs, `RecordingSessionManager`
  de ponta a ponta multi-trilha (start/appendChunk/stop reais, microfone+câmera+tela+áudio do
  sistema simultâneos e independentes, escrita em disco, manifest, DB, chunks fora de ordem,
  falhas, trilha registrada que nunca recebe chunk algum, **rotação de segmento mid-sessão,
  manifest com múltiplos segmentos por trilha, chunk de segmento já rotacionado descartado,
  `stop()` correndo em paralelo com um `appendChunk` tardio, pausar/retomar (transição de estado +
  intervalo de manifest aberto/fechado), múltiplos ciclos de pausa/retomada, `stop()` ainda
  pausado, as rejeições de pausa/retomada inválida, marcadores (timestamp relativo ao início com
  `vi.useFakeTimers()`, desconto de pausa fechada, título/nota opcionais, persistência via
  `listMarkers`, e as rejeições de marcador inválido, **monitor de espaço em disco: inicia
  normalmente sem/com o parâmetro satisfeito, rejeita quando o limite excede o espaço real, máquina
  de estados permanece em `IDLE` após rejeição, novo `start()` funciona após rejeição anterior**)**),
  filesystem/escrita atômica, construção de argumentos FFmpeg, classificação de fontes de tela,
  cálculo de nível de áudio (RMS), formatação de tempo decorrido, **limiar puro de rotação por
  tamanho**, **limiar puro de classificação de espaço em disco (`classifyDiskSpace`, ok/warning/
  critical, limite exato conta como o lado mais seguro)**, **`RecoveryService` de ponta a ponta
  (`recovery.service.test.ts`, reaproveitando o mesmo `RecordingSessionManager` real dos demais
  testes de gravação, deliberadamente sem chamar `stop()` para reproduzir um crash de verdade sem
  matar nenhum processo): detecção marca `RECOVERABLE` só quem realmente foi interrompido, ignora
  projeto `IDLE` vazio e `COMPLETED`, é idempotente; reparo recupera um segmento válido com o
  tamanho real do arquivo, descarta um segmento de 0 bytes marcando o projeto `FAILED` quando nada
  sobrevive, mantém só as trilhas que sobreviveram quando trilhas diferentes crasham de formas
  diferentes, e continua funcionando via banco mesmo com o manifest ausente**, **`ProjectService`
  de ponta a ponta (`project.service.test.ts`, mesmo padrão de reaproveitar o
  `RecordingSessionManager` real): agregação de detalhes por trilha com/sem dados gravados,
  renomear com sucesso/projeto inexistente/gravação ativa, excluir com sucesso (remove banco E
  disco)/projeto inexistente/gravação ativa (mantendo banco e arquivos intactos)**, **`EditorService`
  de ponta a ponta (`editor.service.test.ts`): cria com nome padrão (título da gravação) ou
  customizado, rejeita gravação inexistente e qualquer status que não seja `COMPLETED` (via
  `it.each`), permite múltiplos projetos de edição independentes para a mesma gravação, busca por
  id/rejeita id inexistente, lista vazia ou com múltiplas gravações, **timeline: projeto de edição
  inexistente, timeline vazia, um clip próximo do início, múltiplas trilhas ancoradas na mesma
  sessão (não cada uma no seu próprio zero), segmentos rotacionados como clips separados e
  ordenados, segmento nunca finalizado excluído (e a trilha inteira junto, se nada sobrevive)**,
  **protocolo de mídia local: `guessMediaContentType` (vídeo vs. áudio por subpasta),
  `parseRangeHeader` (range simples/aberto/inválido/fora dos limites), `isValidMediaRelativePath`
  (aceita só o padrão exato, rejeita directory traversal), `buildMeetingMediaUrl` (encoding de
  path, separadores Windows normalizados), `pickPreviewTrack`/`isVideoTrackType` (prioridade
  tela > câmera > áudio)**, **sincronização de reprodução multi-trilha: `findClipAtTime` (clip que
  cobre um instante, `null` num gap/antes do primeiro/depois do último), `clipLocalTimeSeconds`
  (conversão global→local com clamp), `isDrifting` (limiar padrão e customizado),
  `msFromPointerOffset` (clique em pixel → instante global, com clamp nas duas pontas e divisão
  por zero segura)**, **algoritmo puro de corte (`applyRemoveRange` - clip antes/depois/tocando a
  fronteira/dividido ao meio/engolido inteiro, multi-trilha com layouts diferentes, seqIndex/
  relativePath/byteSize preservados através de um split)**, **`EditorService.getEditedTimeline`/
  `removeRange` de ponta a ponta (segmentos com `startedAtMs` fixo para matemática precisa: sem
  operações ainda = igual à bruta, uma operação reflete o corte, duas operações compõem relativas
  à timeline já editada, revision incrementa a cada corte, validação de intervalo inválido/além do
  fim atual, corte simultâneo em múltiplas trilhas)**, **`EditorService.undo`/`redo` de ponta a
  ponta (rejeita sem nada pendente, reverte sem apagar a operação, reaplica, múltiplos ciclos em
  duas operações NA ORDEM CORRETA, criar uma operação nova depois de um undo poda o ramo abandonado
  permanentemente, revision incrementa em ambos)**, **`EditorService.setTrackGain` de ponta a
  ponta (aplica a trilha certa sem afetar as outras, um segundo `SET_GAIN` na mesma trilha
  SUBSTITUI em vez de acumular, rejeita trackId inexistente na timeline atual, revision
  incrementa, undo/redo funcionam sobre esta operação igual a qualquer outra do log, poda de ramo
  abandonado, uma trilha depois totalmente removida por `REMOVE_RANGE` não quebra nada)**,
  **`dbToLinearVolume` puro (0dB=1, -60dB≈0.001, -6dB≈meia amplitude, clamps defensivos)**,
  **`EditorService.setTrackFade` de ponta a ponta (aplica a trilha certa sem afetar as outras, um
  segundo `SET_FADE` na mesma trilha SUBSTITUI em vez de acumular, rejeita trackId inexistente,
  revision incrementa, undo/redo funcionam sobre esta operação, poda de ramo abandonado, trilha
  removida por `REMOVE_RANGE` não quebra nada, `SET_GAIN`/`SET_FADE` coexistem de forma
  independente na mesma trilha)**, **`fadeVolumeMultiplier` puro (sem fade = 1, silêncio exato nas
  bordas da janela, rampa linear, plateau antes/depois da janela, combinação fade-in+fade-out via
  mínimo, trilha degenerada sem NaN/divisão por zero)**,
  wrapper de IPC (validação/erro/sucesso), schemas Zod (incluindo `project.openFolder`), erros de
  domínio, migrations (tabelas/índices/FKs), repositórios (project/settings/export-job), serviço
  de configurações, store de tema, smoke test de componente (jsdom), **`EditorService.setTrackTransform`
  de ponta a ponta (timeline bruta dá o padrão PiP a toda trilha CAMERA e `null` a qualquer outra,
  aplica só na trilha alvo, um segundo `SET_CAMERA_TRANSFORM` SUBSTITUI em vez de acumular, rejeita
  trackId inexistente, rejeita trackId que não é CAMERA, revision incrementa, undo/redo funcionam,
  poda de ramo abandonado, trilha removida por REMOVE_RANGE não quebra nada, SET_GAIN/SET_FADE/
  SET_CAMERA_TRANSFORM coexistem de forma independente)**, **`pickOverlayCameraTrack` puro** (fundo
  diferente da câmera, câmera-é-o-próprio-fundo, sem trilha câmera, `visible: false`,
  `cameraTransform` nulo defensivo), **`EditorService.setLayoutPreset` de ponta a ponta** (timeline
  editada relata `PIP` antes de qualquer `SET_LAYOUT`, aplica à composição inteira sem depender de
  trilha nenhuma, um segundo `SET_LAYOUT` SUBSTITUI em vez de acumular, aceita qualquer preset
  mesmo sem as trilhas correspondentes, revision incrementa, undo/redo funcionam, poda de ramo
  abandonado, coexiste independente de `SET_GAIN`/`SET_FADE`/`SET_CAMERA_TRANSFORM`), **`computePreviewLayout` puro**
  (os 4 presets com/sem as trilhas necessárias, fallback pro comportamento PIP, zero trilhas).
  **`appendOperation` atomicity (EDIT-012)** (simula um crash no meio da escrita - `create` lança
  depois do `deleteAfterSequence` já ter rodado dentro da mesma transação - confirma que cursor,
  revision e o log ficam EXATAMENTE como antes da tentativa, e que o serviço continua funcional
  depois), **`buildRenderPlan` (EXP-001)** (os 3 modos de layout com as trilhas certas, filtro de
  trilha não-vídeo, trilha mutada OU não-vídeo excluída do mix de áudio, ganho/fade resolvidos,
  conversão de clips, resoluções 720p/1080p, faixa de tempo padrão vs. explícita),
  **`runFfmpegProcess`/`parseFfmpegProgressLine`/`computeExportProgress` (EXP-002)** (spawns reais
  via `process.execPath`, sem mockar `child_process` - exitCode/stderr/progresso/cancelamento de
  verdade), `resolveFfmpegBinaries` resolvendo pro binário real instalado, **`buildFfmpegArgs`
  (EXP-003/004)** (null pra PiP/lado-a-lado/sem-vídeo, inputs/filtro bem formados, concat
  multi-clip com reuso de input, volume+fade+amix, sem amix pra trilha única, trim de faixa de
  tempo, rejeita path fora do projeto), **`ExportService` de ponta a ponta** (validação sem
  spawnar FFmpeg + testes de INTEGRAÇÃO REAL que geram clipes sintéticos via `ffmpeg-static` e
  rodam o pipeline inteiro até um MP4/WAV real em disco), e a regressão dedicada do bug de
  `JobRunner`/`ExportJobStore` (`export-job-store.test.ts`, via os dois reais, não um store fake),
  **`buildAudioFfmpegArgs` (EXP-005)** (null sem trilha de áudio, ignora vídeo/resolução
  completamente, mapeia `[afinal]`/`-vn`, codec certo por formato M4A/MP3/WAV com/sem `-b:a`,
  `amix`, trim de faixa de tempo, rejeita path fora do projeto), **exportação de faixa de tempo
  (EXP-006)** (`ValidationError` quando `rangeMs.endMs` excede `totalDurationMs`, integração REAL
  provando via tamanho de arquivo WAV que o recorte é aplicado de verdade, schema aceita/rejeita
  `rangeMs`/`target` conforme esperado), **progresso e cancelamento de exportação (EXP-007/008)**
  (regressão dedicada da corrida de `JobRunner.run()` vs. `cancel()` concorrente - cobrindo tanto o
  caminho de sucesso quanto o de falha do handler - via o `JobStore` fake em memória já existente
  em `job-runner.test.ts`; integração REAL em `export.service.test.ts` que cancela um clipe
  sintético deliberadamente maior/mais pesado ~300ms após iniciar, confirma `CANCELED` com
  `outputPath: null`, prova que o processo real morreu observando o arquivo de saída parar de
  crescer, e confirma que cancelar de novo um job já terminal é um no-op seguro), **validação do
  arquivo exportado via ffprobe (EXP-009)** (`validateFfprobeOutput` puro - JSON inválido,
  não-objeto, zero streams, streams ausente, duração zero/ausente/não-numérica, caso válido com
  `durationMs` calculado -, `runFfprobeProcess` via spawns reais de `process.execPath`, e
  integração REAL confirmando que um `ffprobePath` quebrado faz o job terminar `FAILED` mesmo com
  um MP4 genuinamente válido em disco e `exitCode 0` do FFmpeg, mais o caminho feliz confirmando
  zero falsos negativos), **PiP e lado-a-lado reais na exportação (EXP-004b)** (estruturais em
  `ffmpeg-command.test.ts` confirmando o filtro `overlay` real - posição/tamanho em pixels,
  `eof_action=pass` - e o `hstack` real - cada metade escalada/preenchida pro tamanho exato -, mais
  2 testes de integração REAL que exportam tela+câmera sintéticas em PiP e em lado-a-lado,
  confirmando via ffprobe que a saída tem exatamente a resolução pedida), **transcrição - abstração
  de provedor (AI-001)** (`transcription.service.test.ts` com repositórios/`JobRunner` reais -
  validação de projeto ausente/não-`COMPLETED`/sem trilha de áudio, enfileiramento real confirmando
  que o job SEMPRE termina `FAILED` com a mensagem exata de "nenhum provedor configurado",
  `listJobs`/`getStatus`, `getTranscript` lendo o mais recente com segmentos ordenados por
  `startMs` -, `buildTranscriptEntities` isolado, e schema `transcription.schema.ts`), e a
  atualização de `migrate.test.ts` pras 3 tabelas/3 índices novos, e **busca full-text local
  (SEARCH-001)** (`search.service.test.ts` - `buildFtsMatchQuery` isolado e `SearchService` de
  ponta a ponta contra um banco real semeado via `TranscriptRepository.createWithSegments` -, e a
  atualização de `migrate.test.ts` pra 16 tabelas/3 gatilhos novos de sincronia do FTS5), e
  **destaque de trecho na busca** (`parseSnippet` isolado - sem marcador, um termo destacado,
  múltiplos termos, string vazia, marcador desbalanceado nunca lança -, mais uma asserção contra o
  `snippet()` REAL do FTS5 confirmando o termo buscado marcado `highlighted: true`), e
  **transcrição local via Whisper** (`transcription-audio-extraction.test.ts` - concat de
  segmentos da mesma trilha, `amix` entre trilhas diferentes, dedupe de input, directory traversal
  rejeitado -, `whisper-local-provider.test.ts` - parser WAV PCM16 mono/estéreo, mapeamento de
  timestamps do Whisper pra `TranscribedSegment`, progresso/cache/propagação de erro do pipeline
  injetado -, e `transcription.service.test.ts` reescrito com extração de áudio REAL via
  `ffmpeg-static` + provedor FALSO injetado: `COMPLETED` com transcript persistido de verdade,
  `FAILED` com a mensagem exata do provedor, `FAILED` quando a própria extração falha), e
  **edição/exclusão de marcadores** (`marker.repository.test.ts` - update parcial por campo,
  `null` explícito limpa, patch vazio nunca quebra, delete não afeta outros marcadores).
  **468 testes, 40 arquivos.**
- **Playwright** (`tests/e2e/`): abertura do app + título + sidebar + zero erros de console + banco
  criado em `userData` (`app-launch.spec.ts`); navegação por todas as rotas da sidebar
  (`navigation.spec.ts`); **gravação real de microfone + câmera**, **tela + microfone**, **áudio
  do sistema + microfone**, **segmentação por tamanho (câmera, limite de 1 MB)**, **pausar/
  retomar (microfone)**, **marcadores (microfone, criação com título/nota opcionais + bloqueio
  durante pausa)**, **monitor de espaço em disco (rejeição de início abaixo do limite mínimo; banner de
  aviso + auto-stop seguro abaixo do limite crítico, confirmando um único segmento finalizado e
  manifest `COMPLETED`)** e **recuperação (dois lançamentos reais e sequenciais do Electron - o
  primeiro grava e fecha sem clicar em "Parar", o segundo relança o app e confirma o selo
  "Incompleta" na Biblioteca, repara pelo clique, confirma status `COMPLETED` com o arquivo ainda
  intacto)**, cada cenário de ponta a ponta com dispositivos de áudio/vídeo sintéticos do Chromium
  (câmera/microfone) e captura real de tela/áudio do sistema, verificando os arquivos de segmento
  gravados em disco via `expect.poll` (`recording.spec.ts`, ver decisões registradas #22 sobre não
  empilhar todas as trilhas num único teste, #23 sobre timeouts/retries, #25 sobre o emparelhamento
  áudio+vídeo do áudio do sistema, #28/#29 sobre rotação de segmento e #45 sobre a mesma classe de
  timeout/retry aplicada ao syscall real de disco). **20 testes**, validados em 2 execuções
  completas consecutivas da suíte inteira: a primeira limpa (19 passaram, 1 flaky recuperado via
  retry - a já conhecida contenção de recursos da trilha de câmera, decisão #23); a segunda sob
  contenção de recursos excepcionalmente severa desta máquina (>20 processos `electron`/`node`
  concorrentes no momento, incluindo servidores MCP não relacionados) — 8 testes PRÉ-EXISTENTES
  (não tocados por este incremento: microfone+câmera, tela+microfone, áudio do sistema+microfone,
  segmentação, pausar/retomar, marcadores, disco) falharam mesmo após esgotar os retries
  configurados, mas **o cenário de recuperação (novo nesta incremento) passou de forma limpa em
  AMBAS as execuções** (8.6s e 8.1s, sem nenhum retry em nenhuma delas) - evidência forte de que a
  lógica de recuperação em si é sólida mesmo sob a pior contenção de recursos observada nesta
  sessão até agora, e que os 8 fracassos são a mesma classe de flakiness ambiental já documentada
  (decisão #23), apenas numa instância particularmente severa, não uma regressão deste incremento.
  **Hardening deste incremento (não relacionado ao playhead/multi-trilha em si)**: os blocos
  `recording (screen + microphone)`, `recording (system audio + microphone)`,
  `recording (pause/resume)` e `recording (markers)` estavam SEM `test.describe.configure({retries: 2})`
  - um descuido pré-existente, não coberto pelos outros incrementos - o que fazia qualquer um deles
  falhar de vez (sem chance de recuperação) ao bater na mesma flakiness ambiental que os demais
  blocos toleram via retry. Corrigido para o mesmo padrão usado em todo o resto do arquivo.
  Confirmado na validação: `recording (markers)` bateu na flakiness conhecida (`getByRole('status')`
  sem "REC" a tempo) numa das duas execuções completas deste incremento e agora se recupera no
  retry, exatamente como os demais blocos já faziam.
- **Playwright** (`tests/e2e/library.spec.ts`, arquivo próprio - decisão #54): grava uma sessão
  real curta (só microfone, com um marcador com título/nota criado durante a gravação desde o
  refinamento de marcadores), abre a Biblioteca, expande "Detalhes" (confirma a trilha de
  microfone com bytes reais e o marcador com título/nota visíveis), renomeia inline, exclui com o
  passo de confirmação, confirma que o item some da lista E que a pasta some do disco. **2
  testes** (o segundo, AI-001: grava uma sessão curta, clica "Transcrever" nos detalhes
  expandidos, confirma que o status chega em "Falhou" com a mensagem exata "Nenhum provedor de
  transcrição configurado" - prova o pipeline de IPC/job de ponta a ponta pela UI). Validado limpo
  isolado numa execução de cada (49,2s pro de transcrição); execuções subsequentes de ambos
  bateram na mesma classe de flakiness de bootstrap já documentada, sob uma queda de RAM livre
  real confirmada (~800MB → ~415MB de 16GB) durante a validação - nunca dentro do código de
  marcadores/transcrição em si.
- **Playwright** (`tests/e2e/editor.spec.ts`, arquivo próprio - mesmo padrão da decisão #54): grava
  uma sessão real curta, cria o projeto de edição pelo botão "Editar" na Biblioteca, confirma a
  navegação e o resumo da gravação vinculada na página de detalhe, reabre pela lista geral
  "/editor"; segundo teste confirma a rejeição ao tentar criar um projeto de edição para uma
  gravação que nunca chegou a `COMPLETED`; terceiro teste (`test.describe('editor (timeline)')`,
  EDIT-002) grava microfone + câmera, cria o projeto de edição, confirma duas faixas (uma por
  trilha) com um clip cada; quarto teste (`test.describe('editor (preview)')`, EDIT-003 parte 1)
  grava com câmera, cria o projeto de edição, confirma que o `<video>` decodificou um frame real
  (`videoWidth > 0`) via o protocolo `meeting-media://`; quinto teste
  (`test.describe('editor (playback)')`, EDIT-003 parte 2) grava microfone + câmera, aperta
  "Reproduzir" e confirma que AMBAS as trilhas avançam juntas (não só a exibida no preview),
  "Pausar" congela o instante, e clicar perto do início da régua da timeline faz as duas trilhas
  voltarem juntas; sexto teste (`test.describe('editor (trim/remove-range)')`, EDIT-004/005/006)
  grava com câmera, corta o início via "Cortar antes daqui" e confirma via `editor.getEditedTimeline`
  (chamada direta pela API) que a duração encolheu, depois marca e remove uma seleção manual,
  confirmando um segundo encolhimento; sétimo teste (`test.describe('editor (undo/redo)')`,
  EDIT-007) grava com câmera, corta um trecho, desfaz pelo botão "Desfazer" (duração volta ao
  original, "Refazer" habilita), refaz pelo atalho Ctrl+Shift+Z (duração encolhe de novo), desfaz
  de novo pelo atalho Ctrl+Z e corta um trecho DIFERENTE, confirmando que "Refazer" fica
  desabilitado (o ramo antigo foi podado); oitavo teste (`test.describe('editor (gain/mute)')`,
  EDIT-008) grava microfone+câmera, muta a trilha de microfone pelo botão, ajusta o ganho da
  câmera pelo slider (setter nativo bypassando o rastreador de valor do React), confirma via
  `editor.getEditedTimeline` que as duas trilhas são ajustadas de forma independente, e que
  Ctrl+Z desfaz só a ÚLTIMA operação do log (o ganho da câmera), preservando o mudo do microfone;
  nono teste (`test.describe('editor (fade)')`, EDIT-009) grava microfone+câmera, ajusta fade-in e
  fade-out da trilha de microfone pelos dois campos numéricos, confirma via
  `editor.getEditedTimeline` que os dois valores foram persistidos corretamente, e que Ctrl+Z
  desfaz só a ÚLTIMA operação do log (o fade-out), preservando o fade-in; décimo teste
  (`test.describe('editor (camera transform)')`, EDIT-010) grava microfone+câmera, confirma que os
  controles de transformação (checkbox + sliders) SÓ aparecem na linha da trilha CAMERA, desliga a
  visibilidade pelo checkbox, ajusta a posição X pelo slider, confirma via `editor.getEditedTimeline`
  que os dois ajustes foram persistidos (visibilidade preservada ao ajustar X), e que Ctrl+Z desfaz
  só a ÚLTIMA operação (o X), preservando a visibilidade desligada.
  **10 testes**, isolado `editor (camera transform)` passou de forma limpa em três execuções
  isoladas seguidas (~9-10s cada, sem retry) e também na PRIMEIRA execução completa da suíte
  (8,3s, sem retry) - só falhou (esgotando os 3 retries) na SEGUNDA execução completa, um episódio
  de contenção mais severo que afetou simultaneamente 5 testes PRÉ-EXISTENTES não relacionados
  (gain/mute, undo/redo, trim/remove-range, screen+microfone, biblioteca) e 3 outros ficaram flaky -
  **toda falha do novo teste, confirmada via `error-context.md` de cada tentativa, ocorreu na
  mesma etapa de setup compartilhada** (`getByLabel('Camera')`/botão "Iniciar gravacao"/
  `getByRole('status')` conter "REC"), nunca dentro do código de transformação de câmera em si -
  nunca chegou a exercitar a lógica nova. **Bug real encontrado e corrigido durante esta
  validação** (não no código de produção, no teste E2E PRÉ-EXISTENTE de gain/mute): seu seletor
  `input[type="range"]` deixou de ser único dentro da linha da trilha CAMERA assim que os quatro
  novos sliders de posição/tamanho foram adicionados (`strict mode violation: resolved to 5
  elements`) - corrigido trocando por um rótulo específico (`getByLabel('Ganho da trilha
  Câmera')`), confirmado com uma execução isolada limpa depois do ajuste. Correção de lógica
  confirmada pelos 10 testes de integração dedicados do `EditorService.setTrackTransform` + 5 de
  `pickOverlayCameraTrack` (todos verdes) e pelas execuções isoladas/primeira-execução-completa
  limpas do próprio teste E2E - mesma linha de evidência já usada nos incrementos anteriores
  (EDIT-007/008/009) para aceitar a contenção de recursos da máquina como causa raiz das falhas
  restantes, não uma regressão deste incremento; décimo primeiro teste
  (`test.describe('editor (layout)')`, EDIT-011) grava microfone+câmera, confirma `layoutPreset`
  padrão `PIP` via `editor.getEditedTimeline`, troca pro preset "Só câmera" e depois "Lado a lado"
  pelo select "Layout", confirma cada troca via API, e que Ctrl+Z desfaz só a ÚLTIMA troca (volta
  pra "Só câmera", não até `PIP`) - um `<select>` não é `INPUT`/`TEXTAREA`, então o guard de foco
  de texto do atalho global não bloqueia, sem precisar de `.blur()` (ao contrário dos testes de
  fade/transformação de câmera que usam `.fill()`/clique em checkbox).
  **11 testes**, isolado `editor (layout)` passou de forma limpa (10,0s, sem retry) e também na
  PRIMEIRA execução completa da suíte (10,0s, sem retry) - só falhou (esgotando os 3 retries) na
  SEGUNDA execução completa, um episódio de contenção mais amplo que afetou simultaneamente 5
  testes PRÉ-EXISTENTES não relacionados (timeline, preview, transformação de câmera, biblioteca) e
  5 outros ficaram flaky - **toda falha do novo teste, confirmada via `error-context.md` de cada
  tentativa, ocorreu na mesma etapa de setup compartilhada** (`getByLabel('Camera')`/
  `getByRole('status')` conter "REC"), nunca dentro do código de layout em si - nunca chegou a
  exercitar a lógica nova. Também confirmado que os testes pré-existentes de gain/mute e
  transformação de câmera continuam passando sem interferência do novo select "Layout" adicionado
  à mesma tela. Correção de lógica confirmada pelos 8 testes de integração dedicados do
  `EditorService.setLayoutPreset` + 10 de `computePreviewLayout` (todos verdes) e pelas execuções
  isoladas/primeira-execução-completa limpas do próprio teste E2E - mesma linha de evidência já
  usada em todos os incrementos anteriores da Fase 3 para aceitar a contenção de recursos da
  máquina como causa raiz das falhas restantes, não uma regressão deste incremento; décimo segundo
  teste (`test.describe('editor (autosave indicator)')`, EDIT-012) grava só microfone, confirma
  que o indicador ".editor-save-status" já mostra "Alterações salvas automaticamente" ANTES de
  qualquer mutação, troca o layout pelo select, e confirma que o indicador volta pro mesmo texto
  (nunca preso em "Salvando..." nem com a classe de erro).
  **13 testes**, isolado `editor (autosave indicator)` passou de forma limpa (10,3s, sem retry)
  depois de uma primeira tentativa isolada que bateu na mesma classe de bootstrap já documentada
  (`getByRole('status')` sem "REC" a tempo, confirmado via `error-context.md`, nunca dentro do
  código de dirty-state em si). Rodada dedicada de regressão nos testes pré-existentes de
  `gain/mute`, `layout` e `undo/redo` (que agora também passam pelos novos `beginSave`/`endSave`
  em TODOS os sete handlers de mutação) confirmou que os únicos dois falharam/um ficou flaky na
  mesma etapa de setup compartilhada de sempre, nunca dentro da lógica nova - sem nenhuma regressão
  visível causada pelo indicador de salvamento. Correção de lógica confirmada pelo teste de
  atomicidade do `EditorService` (100% verde) e pela execução isolada limpa do próprio teste E2E.
  Décimo terceiro teste (`test.describe('editor (export)')`, EXP-003/004) grava tela+microfone
  reais, cria o projeto de edição, clica em "Exportar em 720p", espera o indicador
  `.editor-export-status` mostrar "Concluída" (timeout bem mais generoso que os demais - um encode
  FFmpeg real precisa de tempo de verdade, não só I/O de disco) e confirma via `export.list` que o
  arquivo MP4 existe de verdade em disco com bytes - a única forma de confirmar que a nova
  superfície de UI/IPC funciona de ponta a ponta, não só em isolamento (unit tests). Isolado, o
  teste falhou nas duas primeiras tentativas por `electron.launch: WebSocket error: read
  ECONNRESET`/`Target page, context or browser has been closed` (o Electron nem chegou a abrir,
  mesma classe de contenção severa de recursos da máquina já documentada em incrementos
  anteriores) e passou limpo na terceira (44,9s, tempo real de encode incluído) - nunca uma falha
  de asserção dentro do teste em si.
  Décimo quarto teste (`editor (export)`, EXP-007/008) grava um pouco mais que o teste de sucesso
  (mais frames reais capturados, janela real de encode maior), clica em "Exportar em 1080p", clica
  em "Cancelar exportação" assim que o botão aparece (sem esperar o job terminar), confirma que o
  status vira "Cancelada" e que o botão de cancelar some (só aparece com um job `QUEUED`/`RUNNING`)
  — exercita a superfície de UI/IPC nova (`export.cancel`) de ponta a ponta, complementando a
  cobertura de matar o processo real de verdade já feita em `export.service.test.ts`. Isolado,
  passou limpo em duas execuções consecutivas (12,0s e 11,0s, sem retry em nenhuma).
  Décimo quinto teste (`editor (export)`, EXP-004b) grava tela E câmera JUNTAS (a primeira vez
  neste projeto que um teste grava as duas fontes de vídeo simultaneamente especificamente pra um
  cenário de exportação) - com as duas trilhas de vídeo presentes, `layoutPreset` resolve pro
  padrão `'PIP'` automaticamente (confirmado explicitamente no teste antes de exportar), clica em
  "Exportar em 720p", confirma "Concluída" e um MP4 real em disco - a única forma de confirmar que
  a composição PiP real (filtro `overlay`) funciona de ponta a ponta pela UI, não só em isolamento
  (`export.service.test.ts` já prova as dimensões exatas via ffprobe real, tanto pra PiP quanto
  lado-a-lado). Passou limpo em duas execuções isoladas consecutivas (16,7s e 12,3s, sem retry em
  nenhuma); uma rodada de regressão dedicada re-executando `editor (layout)` e
  `editor (camera transform)` confirmou que nada quebrou - a única falha foi a mesma classe de
  flakiness de bootstrap já documentada (`getByRole('status')` sem "REC" a tempo), recuperada no
  retry, nunca dentro de código tocado por este incremento.
  `tests/e2e/search.spec.ts` (SEARCH-001, arquivo novo) cobre a busca de ponta a ponta: navega
  pra "/search" pela sidebar, digita uma query, clica "Buscar" e confirma o estado "nenhum
  resultado" (o único desfecho possível hoje - nenhum caminho de UI cria transcritos reais
  enquanto AI-002 não existe), mais um segundo teste confirmando que o botão fica desabilitado pra
  uma busca só de espaços; a rota "Busca" também foi adicionada à lista existente de
  `navigation.spec.ts`. Passou limpo isolado (9/9 entre os dois arquivos, 54,9s, sem retry).

## Pendências conhecidas

- Empacotamento (`electron-builder`) e nuvem/colaboração — fora do escopo do MVP por desenho (ver
  `11_ROADMAP_BACKLOG.md`, Fases 8-9).
- **Transcrição via `OPENAI` segue sem implementação** (`WHISPER_LOCAL`, o provedor padrão de
  fato, transcreve de verdade desde o refinamento pós-SEARCH-001 - ver
  [Transcrição real: Whisper 100% local](#transcrição-real-whisper-100-local-fase-5)) - AI-002
  (a alternativa PAGA, aguardando o usuário) entregaria a integração real com a OpenAI, o
  consentimento explícito exigido por `09_SECURITY_PRIVACY_COMPLIANCE.md` §11 e o armazenamento
  seguro da chave de API (`safeStorage`).
- Monitor de espaço em disco não tem indicador visual de "espaço OK" explícito, só o texto de
  espaço livre sempre visível e o banner de aviso quando baixo (refinamento futuro cosmético, não
  bloqueante). Correção do bug do `check-disk-space` (ver decisão #39) foi um benefício colateral
  para o indicador pré-existente da Home, que estava silenciosamente quebrado desde a Fase 0.
- Segmentação por TEMPO não é exercitada em E2E (só a via testes unitários sintéticos, que não
  dependem de tempo real) — `timeSegmentationMinutes` é um inteiro em minutos (mínimo 1) no
  schema, sem caminho para forçar uma rotação em segundos num teste sem mudar o schema só por
  conveniência de teste (decisão registrada, ver comentário no topo de `recording.spec.ts`).
- `qualityPreset` (mesma categoria de settings da segmentação) segue sem UI e sem nenhum efeito
  real na captura (resolução/fps/bitrate) — schema e defaults existem desde a Fase 0, nunca
  consumidos.
- Se `RecordingSessionManager` falhar ao ABRIR um novo segmento no meio de uma rotação (ex.: erro
  de disco), a trilha fica sem segmento atual até a próxima tentativa de chunk (que tenta abrir de
  novo) - não há um limite de retentativas nem um erro visível na UI para esse caso específico;
  falha ao persistir UM chunk já não interrompe a gravação por desenho, mas esse caminho
  específico não tem teste dedicado.
- Captura simultânea das **4** fontes (tela+câmera+microfone+áudio do sistema) não é exercitada em
  E2E com hardware real neste ambiente de teste (contenção de recursos - decisão registrada #22);
  a lógica está provada correta via teste sintético de 4 trilhas em
  `recording-session-manager.test.ts`.
- Áudio do sistema não tem indicador visual quando a plataforma não suporta (RF-005 degrada
  graciosamente, mas a UI não avisa o usuário que aquela trilha ficou de fora - refinamento
  futuro, não bloqueante). O mesmo vale se não houver nenhuma fonte `kind: 'screen'` disponível
  para servir de portador da captura.
- `RecordingSetupPage` ainda não tem seleção de qualidade/segmentação/layout (também previstos na
  tela de setup por `08_UX_FLOWS.md` §3).
- Biblioteca ainda não tem uma tela de detalhes do projeto (duração, trilhas gravadas, tamanho em
  disco, player embutido) nem busca/filtro/ordenação - cada item só tem o título e o botão "Abrir
  pasta" (decisão #27); útil para achar o arquivo, mas não substitui uma visão real do projeto.
- Preview de tela usa apenas a miniatura estática do `desktopCapturer`, não uma captura ao vivo.
- Só uma sessão de gravação por vez (processo inteiro) - correto para o MVP atual, mas sem
  isolamento multi-projeto ainda.
- Em `RecordingSessionManager.stop()`, se uma trilha falhar ao fechar no meio do loop de
  finalização multi-trilha, as trilhas seguintes não são finalizadas (a sessão é sempre liberada
  de qualquer forma - o app nunca fica travado - mas o segmento daquela trilha específica pode
  ficar sem `endedAtMs`/`finalized`); limitação conhecida, não exercitada pelos testes atuais.
- `useMediaDevices` trata qualquer falha de `getUserMedia` (inclusive "nenhum dispositivo
  encontrado") como `permissionDenied` — mensagem ligeiramente imprecisa quando a causa real é
  ausência de hardware, não permissão negada; refinamento futuro, não bloqueante.
- Sem seletor de pasta nativo nas Configurações (a pasta padrão da biblioteca é somente leitura
  nesta fase).
- CI (`.github/workflows/ci.yml`) só roda de fato quando o repositório for enviado a um remoto
  GitHub — a estrutura já existe localmente.
- Reparo é uma ação manual (clique em "Reparar") - sem repro automático em background nem
  notificação proativa fora da Biblioteca avisando que existe algo a reparar.
- Trilhas do banco (`tracks`) sem nenhum segmento válido sobrevivente não são removidas pelo
  reparo, só ficam de fora do `manifest.json` reconstruído - linhas órfãs sem efeito prático
  observável nesta fase (nada ainda consulta `tracks` isoladamente de `segments`).
- A Biblioteca não mostra o motivo/detalhe de um reparo que resultou em `FAILED` (quantos
  segmentos foram descartados, por quê) - só a ausência do selo "Incompleta" ou o próprio status
  final; o resultado de `recovery.repair` (`recoveredSegments`/`discardedSegments`) já é retornado
  pelo IPC, só não é exibido na UI ainda.
- Excluir um projeto não pede confirmação por digitação/nome, só um segundo clique ("Sim,
  excluir") - suficiente para o MVP, mas mais fraco que confirmações usadas em apps de produção
  para ações destrutivas de alto risco.
- Renomear só edita `title`; `notes` segue sem UI dedicada (já registrado acima). Não há
  validação de título duplicado entre projetos - dois projetos podem ter o mesmo título sem
  colisão (mesmo raciocínio já registrado na decisão sobre pastas nomeadas por UUID).
- `getProjectDetails` expõe os segmentos FINALIZADOS de cada trilha (`relativePath`/`startedAtMs`/
  `durationMs`, refinamento pós-AI-002-LOCAL - resolveu a pendência anterior o suficiente pro
  player mínimo da Biblioteca), mas ainda não o `id`/`byteSize`/`mimeType` de cada um nem os
  segmentos NÃO finalizados (útil pra uma futura timeline de edição mais detalhada que a atual).
- Projeto de edição ainda não tem renomear nem excluir (só a Biblioteca tem essas ações, para
  gravações - não para projetos de edição). Corte/split/remover-intervalo (EDIT-004/005/006),
  desfazer/refazer (EDIT-007), ganho/mudo (EDIT-008), fade in/out (EDIT-009), visibilidade/
  posição/tamanho de câmera (EDIT-010) por trilha, layout da composição (EDIT-011) e salvamento
  automático (EDIT-012) já funcionam - **Fase 3 (Editor MVP) está completa**, próximo passo é a
  Fase 4 (Export).
- `EditorProjectPage` não trata um `id` de projeto de edição inexistente/inválido na URL de forma
  amigável (`editor.get` lança `NotFoundError`, capturado só como um estado de erro genérico) -
  refinamento futuro, não bloqueante.
- A timeline não tem zoom nem scroll horizontal - para uma gravação muito longa, os clips ficam
  proporcionalmente pequenos na régua inteira (`totalDurationMs`); zoom é um requisito explícito
  do editor (`05_MEDIA_EDITOR.md` §14) que ainda não foi implementado.
- Sem indicação visual de gaps entre clips na mesma trilha (ex.: um pause/resume real deixaria
  dois segmentos consecutivos sem intervalo, mas uma trilha que só rotacionou por tamanho/tempo
  também não tem gap perceptível hoje) - refinamento futuro, não bloqueante para esta etapa.
- Layout (EDIT-011) escolhe ENTRE presets fixos (PiP/lado-a-lado/só-tela/só-câmera) - não há troca
  manual de qual trilha especifica fica em cada papel (ex.: uma gravação com DUAS câmeras não tem
  como escolher qual delas vira o overlay), nem multicamera, nem arrastar/redimensionar o painel
  overlay do PiP diretamente pelo preview (isso continua exigindo os sliders do EDIT-010). O preset
  `SIDE_BY_SIDE` sempre divide o espaço 50/50 - sem controle de proporção entre os dois painéis.
- Sincronização entre trilhas tem tolerância de 250ms (`DRIFT_THRESHOLD_SECONDS`) - suficiente
  para revisar uma gravação, mas não é sample-accurate como um editor profissional de verdade;
  refinamento futuro, não bloqueante para o MVP.
- Buscar (seek) só funciona por clique/toque na régua ou numa lane de trilha - sem arrastar o
  mouse pressionado (drag-scrub contínuo) nem atalhos de teclado (espaço = play/pause, setas = ±1
  frame).
- **Ganho por trilha limitado a atenuação (-60..0dB), sem amplificação acima do original**
  (EDIT-008) - os elementos `<video>`/`<audio>` nativos usados pelo player só suportam `volume`
  linear 0..1; amplificar (ex.: reforçar um microfone gravado baixo) exigiria trocar para a Web
  Audio API (`GainNode`), refinamento futuro.
- **Fade in/out (EDIT-009) é por trilha inteira, não por clip individual nem por janela arbitrária
  no meio da timeline** - `fadeInMs`/`fadeOutMs` sempre contam a partir do início/fim da trilha
  inteira (primeiro clip ao último), então uma trilha com múltiplos clips rotacionados/cortados não
  tem como aplicar um fade só num clip específico no meio. Também não há campo numérico validando
  que `fadeInMs + fadeOutMs` não ultrapasse a duração da trilha (o `Math.min` em
  `fadeVolumeMultiplier` já lida com a sobreposição sem quebrar, mas a UI não avisa o usuário).
- **Transformação de câmera (EDIT-010) é ajustada só por sliders numéricos (0-100%), sem
  arrastar/redimensionar diretamente no preview** - não há alças visuais (drag handles) no canvas;
  o usuário vê o resultado em tempo real (o overlay se move/redimensiona conforme os sliders
  mudam), mas não interage diretamente com o retângulo do preview. Também não há "crop" real da
  fonte (só posição/tamanho do CONTAINER do overlay - `object-fit: cover` recorta visualmente, mas
  não existe um campo para escolher QUAL parte do vídeo original fica visível). Um `shape: 'circle'`
  usa `border-radius: 50%` sobre uma caixa possivelmente não-quadrada - um retângulo largo vira uma
  elipse, não um círculo perfeito, a menos que `widthPercent`/`heightPercent` já sejam
  proporcionais ao aspecto real do elemento renderizado. **Desde EXP-004b, a mesma aproximação vale
  pro arquivo EXPORTADO** (não só o preview) - `buildFfmpegArgs` compõe o overlay PiP como um
  retângulo sempre, independente de `shape`; um recorte circular real exigiria um filtro
  `geq`/`alphamerge` mascarando o canal alfa por coordenada, fora do escopo entregue.
- Não há UI pra ajustar a divisão do `SIDE_BY_SIDE` (fixo em 50/50, tanto no preview quanto no
  arquivo exportado desde EXP-004b) nem uma prévia em miniatura de cada preset antes de aplicar -
  o usuário só vê o resultado depois de escolher no select.
- O relógio do player não pausa sozinho ao final de cada clip em caso de gap real entre segmentos
  de uma mesma trilha (ex.: um pause/resume real) - a trilha simplesmente fica pausada durante o
  gap e retoma quando o próximo clip começa; comportamento correto, mas sem nenhuma indicação
  visual de "sem sinal" nesse intervalo.
- **Sem visualização/gerenciamento do histórico de operações** - `EditOperationRepository.listByEditProject`
  existe e é usado internamente por `getEditedTimeline`, mas não há tela nem canal IPC dedicado
  pra listar/inspecionar os cortes já feitos num projeto de edição.
- **Seleção manual (marcar início/fim) depende de reproduzir e pausar no ponto certo** - não há
  ainda arrastar diretamente na régua/lane pra definir um intervalo (drag-select), nem digitar um
  timestamp exato; suficiente pra este incremento, mas menos preciso que um scrubber arrastável.
- **`removeRange` não valida limite mínimo de duração remanescente** - tecnicamente possível
  remover a timeline inteira até sobrar `totalDurationMs = 0` (ou próximo disso); nenhum teste
  cobre esse caso extremo, e a UI não impede explicitamente, só fica sem nada útil pra mostrar.
- **Sem debounce/coalescência de operações de arrasto (EDIT-012)** - um arrasto de slider de
  ganho ou de posição/tamanho de câmera continua gerando UMA operação por evento `input` do
  navegador (pode ser dezenas por gesto de arrasto), cada uma podando a anterior via a mesma
  regra de undo/redo - na prática um "desfazer" depois de um arrasto reverte só o ÚLTIMO tique do
  mouse, não o gesto inteiro. A garantia de atomicidade do EDIT-012 elimina o risco real de perda
  de dados; coalescer um arrasto inteiro numa única operação fica como refinamento futuro.
- **Sem histórico/auditoria visível de saves** - o indicador (EDIT-012) só mostra o estado ATUAL
  ("salvando"/"salvo"/"falhou"), não um log de quando cada mutação foi persistida nem uma forma de
  reexibir uma falha antiga depois que o indicador já voltou pro estado "salvo".
- **Exportação de faixa de tempo (EXP-006) usa a seleção existente, sem indicação visual na
  régua de QUAL trecho será exportado além de um texto** - não há destaque colorido/sombreado do
  intervalo selecionado sobre a régua da timeline (só o texto ".editor-export-range-hint"),
  diferente de um editor profissional que tipicamente destaca visualmente a seleção ativa.
- **A validação via ffprobe (EXP-009) confirma stream(s) + duração positiva, não a integridade
  frame-a-frame do arquivo** - um MP4 com o header correto, pelo menos um stream e uma duração
  plausível passa na validação mesmo que uma parte NO MEIO do arquivo esteja corrompida (ex.: um
  crash do FFmpeg bem no fim do encode, depois do `moov atom` já ter sido escrito) - decodificação
  frame-a-frame completa exigiria um custo de CPU/tempo desproporcional ao problema real que esta
  validação existe pra pegar (encodes que terminam com `exitCode 0` mas nunca produziram frames).
- **Sem suporte a multicamera nem a trilhas de vídeo além de SCREEN/CAMERA no render plan** -
  `RenderPlan.background`/`overlay`/`sideBySideRight` assumem exatamente essas duas trilhas de
  vídeo possíveis, o mesmo escopo do EDIT-010/011; qualquer expansão futura (`05_MEDIA_EDITOR.md`
  §5, "multicamera") exigiria revisitar o modelo.
- **Nome do arquivo exportado não é configurável nem baseado no título da gravação** - sempre
  `export_<resolucao-ou-formato>_<epoch>.<extensão>`; refinamento futuro de UX, não bloqueante.
- **Exportação de áudio (EXP-005) não verifica se o build do FFmpeg de fato suporta `libmp3lame`
  em runtime** - confirmado presente no `ffmpeg-static` instalado via `ffmpeg -version`, mas um
  binário diferente (fork futuro) sem esse codec só falharia no `stderr` do processo (propagado
  como `job.error`), nunca numa checagem antecipada; ver decisão registrada #125.
- **Busca não tem paginação nem ordenação por relevância exposta na UI** - `SearchRepository`
  ordena por `rank` (relevância nativa do FTS5) e limita a 50 resultados fixos
  (`DEFAULT_LIMIT`), mas a UI não mostra "N de M resultados" nem oferece carregar mais.
- **Deep-link de busca só posiciona corretamente dentro do PRIMEIRO segmento finalizado da trilha
  principal** (refinamento pós-AI-002-LOCAL) - o player mínimo da Biblioteca não concatena
  múltiplos segmentos de uma trilha rotacionada nem sincroniza múltiplas trilhas; um resultado de
  busca cujo `startMs` cai além da duração do primeiro segmento (gravação longa com rotação por
  tempo/tamanho) não é alcançável ainda - exigiria a mesma sincronização multi-segmento/multi-trilha
  que o editor já tem (EDIT-003 parte 2), portada pra Biblioteca.
- **Player mínimo da Biblioteca não tem controle de layout PiP/lado-a-lado** - sempre mostra só a
  trilha "principal" (tela>câmera>primeira disponível), nunca a composição completa que o editor
  mostra; suficiente pra "ouvir o trecho", não pra revisar a gravação como um todo (use "Editar"
  pra isso).
- **Transcrição local (`WHISPER_LOCAL`) não tem indicador de progresso do DOWNLOAD do modelo** -
  a UI só mostra "Transcrevendo" (job `RUNNING`) do início ao fim; na primeira transcrição com um
  modelo novo (~150MB-1,5GB), isso pode levar minutos numa conexão lenta sem nenhum feedback mais
  granular ("baixando X de Y MB") - o usuário só vê o mesmo texto parado. `pipeline()` do
  `@huggingface/transformers` expõe um `progress_callback` que daria esse detalhe, não conectado
  ainda.
- **Sem identificação de falante (diarização) na transcrição local** - `speaker` sempre `null` em
  todo segmento produzido por `WHISPER_LOCAL` (o Whisper puro não faz diarização - exigiria um
  modelo separado, ex. `pyannote`, fora do escopo deste refinamento); o campo já existe no schema
  desde AI-001 pra um provedor futuro que o preencha.
- **Transcrição local sempre usa CPU, nunca GPU** - `@huggingface/transformers`/ONNX Runtime
  suportam aceleração por GPU (WebGPU/CUDA) em outros contextos, mas a configuração usada aqui
  (processo main do Electron, execução local) roda inferência só em CPU; numa máquina sem GPU
  dedicada isso é irrelevante, mas deixa desempenho na mesa em máquinas com GPU disponível -
  refinamento futuro, não bloqueante.
- **Trocar de modelo em Configurações durante uma transcrição já em andamento não a afeta** -
  `getModelId()` é lido só no INÍCIO de cada transcrição (`WhisperLocalProvider.transcribe`); uma
  troca no meio de um job em `RUNNING` só vale a partir da PRÓXIMA transcrição, comportamento
  correto mas não documentado na UI.
- **Um modelo baixado nunca é removido automaticamente** - trocar de `base` pra `medium` e voltar
  pra `base` mantém os dois cacheados em `userData/whisper-models` (nenhum limite de espaço, nenhuma
  limpeza); com os três tamanhos testados ao longo do tempo, isso pode chegar a ~2GB em disco sem
  nenhuma UI pra ver ou limpar o cache.

## Próximo passo

A **Fase 1 — Recording Core** está completa (`11_ROADMAP_BACKLOG.md`, REC-001 a REC-015): as
quatro fontes de captura simultâneas, segmentação por tempo/tamanho, pausar/retomar (RF-010),
marcadores (RF-016) e monitor de espaço em disco (RF-042) estão implementados e testados de ponta a
ponta. A **Fase 2 — Recovery + Library** também está completa: RECOV-001/002/003 (manifest,
detecção e reparo de gravações incompletas) e LIB-001/002/004/005/006 (listar, detalhes, renomear,
mostrar na pasta, excluir) funcionam de ponta a ponta. A **Fase 3 — Editor MVP está completa**:
EDIT-001 (criar/abrir projeto de edição), EDIT-002 (timeline compilada somente-leitura), EDIT-003
completo (partes 1 e 2 - preview com playhead sincronizado e reprodução multi-trilha via protocolo
de mídia local seguro), EDIT-004/005/006 (corte/split/remover-intervalo, a primeira operação de
edição real), EDIT-007 (desfazer/refazer, cursor sobre o log de operações), EDIT-008 (ganho/mudo
por trilha, reusando o mesmo log), EDIT-009 (fade in/out por trilha, terceiro tipo de operação
sobre o mesmo log, volume recalculado a cada tick por depender do playhead), EDIT-010
(visibilidade/posição/tamanho de câmera, overlay PiP automático sobre a trilha de fundo), EDIT-011
(layout da composição - PiP/lado-a-lado/só-tela/só-câmera, quarto tipo de operação sobre o mesmo
log, primeira a mirar a composição inteira em vez de uma trilha) e EDIT-012 (salvamento automático
- persistência atômica da escrita do log de operações + indicador de dirty-state na UI) funcionam
de ponta a ponta. A **Fase 4 — Export está completa**: EXP-001 (render plan - "Timeline Compiler"
que traduz a timeline editada numa estrutura `background`/`overlay`/`sideBySideRight`/`audio`/
`output`, reusando a mesma lógica de layout do preview), EXP-002 (`ffmpeg-static`/`ffprobe-static`
instalados, `runFfmpegProcess` com progresso/cancelamento reais), EXP-003/004 (`buildFfmpegArgs`
traduz o `RenderPlan` num comando FFmpeg real - o "FFmpeg Plan" da doc - e `ExportService`
orquestra o pipeline inteiro até um MP4 720p/1080p de verdade em disco), EXP-005 (exportação só de
áudio - M4A/MP3/WAV via `buildAudioFfmpegArgs`, RF-033), EXP-006 (exportação de faixa de tempo -
RF-034, reusando a seleção já existente do editor), EXP-007/008 (progresso - já funcionava desde
EXP-003/004 - e cancelamento de verdade pela UI, matando o processo FFmpeg real, RF-035), EXP-009
(validação real via ffprobe, a etapa "Validation" da doc, confirmando que o arquivo exportado é
utilizável antes de marcar o job `COMPLETED`) e EXP-004b (PiP e lado-a-lado reais no arquivo
exportado, via `overlay`/`hstack` do FFmpeg - o mesmo arranjo que o editor mostra no preview)
funcionam de ponta a ponta, com botões de exportação (vídeo E áudio, com/sem seleção, com cancelar)
na `EditorProjectPage` - ver
[Render plan e wrapper FFmpeg real](#render-plan-e-wrapper-ffmpeg-real-fase-4),
[Export real: comando FFmpeg + ExportService](#export-real-comando-ffmpeg--exportservice-fase-4),
[Exportação só de áudio](#exportação-só-de-áudio---m4ampp3wav-fase-4),
[Exportação de intervalo selecionado](#exportação-de-intervalo-selecionado-fase-4),
[Progresso e cancelamento de exportação](#progresso-e-cancelamento-de-exportação-fase-4),
[Validação do arquivo exportado via ffprobe](#validação-do-arquivo-exportado-via-ffprobe-fase-4) e
[PiP e lado-a-lado reais na exportação](#pip-e-lado-a-lado-reais-na-exportação-fase-4). Desde
EXP-009, o roadmap desta fase está completo e o **Marco MVP** (`11_ROADMAP_BACKLOG.md`) foi
atingido: as quatro fases do MVP (Recording Core, Recovery + Library, Editor MVP, Export) estão
todas completas e testadas de ponta a ponta - EXP-004b é um refinamento dentro desse escopo já
entregue, não um item do roadmap em si. A **Fase 5 — Transcrição** está funcionalmente completa
com um provedor 100% local: AI-001 entregou a abstração (schema/repositórios/job assíncrono/canais
IPC/UI na Biblioteca); um refinamento pós-SEARCH-001 conectou `WHISPER_LOCAL` de verdade (Whisper
via `@huggingface/transformers`, ONNX, três tamanhos de modelo à escolha do usuário em
Configurações, zero custo, zero envio de áudio a qualquer serviço externo) - `transcription.start`
transcreve de ponta a ponta, produz um transcript real e consultável. `OPENAI` (a alternativa paga
citada no roadmap original) segue bloqueada aguardando o usuário - ver
[Transcrição: abstração de provedor](#transcrição-abstração-de-provedor-fase-5) e
[Transcrição real: Whisper 100% local](#transcrição-real-whisper-100-local-fase-5). A **Fase 7 —
Knowledge** começou: SEARCH-001 (busca full-text 100% local via SQLite FTS5) funciona de ponta a
ponta e agora tem transcripts reais pra encontrar (produzidos pelo Whisper local) - ver
[Busca full-text: FTS5 local](#busca-full-text-fts5-local-fase-7).

Desenvolvimento segue de forma incremental e contínua, cada incremento validado
(lint/typecheck/testes/build/E2E) e documentado neste README antes do próximo começar. Ordem
planejada a partir daqui:

1. **AI-002 - OpenAI** (segue bloqueada, aguardando o usuário) - a alternativa PAGA de provedor de
   transcrição (conforme `11_ROADMAP_BACKLOG.md`), que exige três coisas fora do escopo de uma
   decisão técnica livre pra delegar autonomamente: (a) o usuário fornecer sua própria chave de API
   (custo real, por conta do usuário); (b) um consentimento explícito exibido ANTES do primeiro
   envio de áudio a um serviço externo, exigido por `09_SECURITY_PRIVACY_COMPLIANCE.md` §11; (c)
   uma decisão do usuário sobre usar um recurso que envia dados (potencialmente confidenciais) pra
   fora da máquina, num app que se descreve como "local-first" - por isso este incremento fica
   para quando o usuário confirmar que quer prosseguir, ao contrário de todo o resto deste roadmap.
   `WHISPER_LOCAL` já cobre o caso de uso principal (transcrição real, sem custo) enquanto isso não
   acontece.
2. Refinamentos menores ainda pendentes dentro do escopo já entregue do MVP + Fase 5 + Fase 7, sem
   fase própria no roadmap - ver "Pendências conhecidas" para a lista completa acumulada (ex.:
   `shape: 'circle'` continua uma aproximação retangular tanto no preview quanto no export desde
   EXP-004b; `SIDE_BY_SIDE` continua fixo em 50/50; marcadores agora têm edição/exclusão além de
   título/nota + visualização na Biblioteca (MARKERS-EDIT); busca já destaca o termo encontrado no
   resultado e pula direto pro instante no player (LIB-PLAYER), mas ainda não tem paginação;
   transcrição local não mostra progresso do download do modelo nem faz diarização de falantes).
3. Fases 6/8/9 (meeting intelligence, nuvem, integrações) e as sub-fases 2/3 de "Pesquisa"
   (embeddings/busca semântica, perguntas sobre múltiplas reuniões - ambas dependentes de um
   provedor de IA externo pago, mesmo gate de AI-002/OpenAI) - o restante do trabalho pós-MVP, cada
   um exigindo
   um replanejamento próprio (arquitetura, dependências novas, escopo) quando chegar a vez.
