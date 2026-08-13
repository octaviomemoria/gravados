# Meeting Studio

> Nome de trabalho — pode mudar sem impacto arquitetural (`00_README.md`).

Aplicativo desktop para gravação, edição, organização e análise inteligente de reuniões.
Local-first, não destrutivo, recuperável. Windows-first no MVP, sem dependências que impeçam
suporte futuro a macOS.

A **Fase 0 — Bootstrap e Fundação Técnica** está completa: fundação arquitetural
(Electron/React/TypeScript/Vite, IPC tipado e validado, SQLite+Drizzle, segurança de processo,
sistema de jobs, logging, testes/CI). A **Fase 1 — Recording Core** está em andamento:
REC-001 a REC-004 (dispositivos + preview) e um pipeline de captura real com as **quatro fontes
simultâneas do MVP** (tela, câmera, microfone e áudio do sistema, trilhas independentes) já
funcionam de ponta a ponta (gravar → persistir em disco continuamente → finalizar), com
**segmentação automática por tempo/tamanho**, **pausar/retomar** (RF-010) e **marcadores**
(RF-016) já implementados. Ver
[Dispositivos e preview](#dispositivos-e-preview-fase-1),
[Captura real de microfone e câmera](#captura-real-de-microfone-e-câmera-fase-1),
[Segmentação por tempo/tamanho](#segmentação-por-tempotamanho-fase-1),
[Pausar/retomar](#pausarretomar-fase-1) e [Marcadores](#marcadores-fase-1). Monitor de disco
ainda não existe — próximo incremento da Fase 1.

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
- **UI desta etapa é o "marcador instantâneo"** — clicar em "Marcador" cria um marcador sem
  título/nota (ambos ficam `null`) e mostra um contador discreto ("N marcadores") ao lado do
  cronômetro. O schema/IPC/banco já validam e persistem `title`/`note` corretamente (RF-016 os
  define como opcionais no dado, não na UI) — só a captura desses campos durante uma gravação ao
  vivo fica pra um refinamento futuro (mesmo padrão de escopo já usado para segmentação/layout na
  tela de setup, ver README "Pendências conhecidas").
- Testado de ponta a ponta em `tests/e2e/recording.spec.ts` (cenário "markers", microfone sozinho
  — adicionar um marcador não depende de qual fonte é gravada; um segundo teste confirma que o
  botão fica escondido e a ação é bloqueada durante `PAUSADO`) e via 7 testes sintéticos em
  `recording-session-manager.test.ts` (timestamp relativo ao início com `vi.useFakeTimers()`,
  desconto de pausa fechada, título/nota opcionais, persistência via `listMarkers`, e as 3
  rejeições: sem sessão ativa, durante pausa, `projectId` divergente).

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
  e2e/            app-launch.spec.ts, navigation.spec.ts
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
  `listMarkers`, e as rejeições de marcador inválido)**), filesystem/escrita atômica, construção de
  argumentos FFmpeg, classificação de fontes de tela, cálculo de nível de áudio (RMS), formatação
  de tempo decorrido, **limiar puro de rotação por tamanho**, wrapper de IPC (validação/erro/
  sucesso), schemas Zod (incluindo `project.openFolder`), erros de domínio, migrations (tabelas/
  índices/FKs), repositórios (project/settings/export-job), serviço de configurações, store de
  tema, smoke test de componente (jsdom). **118 testes, 21 arquivos.**
- **Playwright** (`tests/e2e/`): abertura do app + título + sidebar + zero erros de console + banco
  criado em `userData` (`app-launch.spec.ts`); navegação por todas as rotas da sidebar
  (`navigation.spec.ts`); **gravação real de microfone + câmera**, **tela + microfone**, **áudio
  do sistema + microfone**, **segmentação por tamanho (câmera, limite de 1 MB)**, **pausar/
  retomar (microfone)** e **marcadores (microfone, criação durante gravação + bloqueio durante
  pausa)**, cada cenário de ponta a ponta com dispositivos de áudio/vídeo sintéticos do Chromium
  (câmera/microfone) e captura real de tela/áudio do sistema, verificando os arquivos de segmento
  gravados em disco via `expect.poll` (`recording.spec.ts`, ver decisões registradas #22 sobre não
  empilhar todas as trilhas num único teste, #23 sobre timeouts/retries, #25 sobre o emparelhamento
  áudio+vídeo do áudio do sistema e #28/#29 sobre rotação de segmento). **17 testes**, validados
  estáveis (todos os testes passam, com a flakiness já conhecida e documentada do cenário de
  segmentação/câmera sob carga cumulativa da suíte inteira absorvida pelos retries — os cenários
  de pausar/retomar e de marcadores passaram de forma limpa, sem nenhum retry, nas execuções) em
  3 execuções completas consecutivas da suíte.

## Pendências conhecidas

- Monitor de disco, editor, transcrição/IA, exportação real em múltiplos formatos (mp4/mp3/wav/etc.
  - pedido explícito do usuário, adiado para um incremento próprio; ver "Próximo passo"),
  empacotamento (`electron-builder`) e nuvem/colaboração — fora do escopo desta fase por desenho
  (ver `11_ROADMAP_BACKLOG.md`).
- Marcadores desta etapa não capturam título/nota durante a gravação ao vivo (UI só cria o
  "marcador instantâneo", sem título/sem nota) — o schema/IPC/banco já suportam os dois campos
  corretamente (RF-016), só falta a UI pra preenchê-los na hora. Também não há tela/lista pra ver
  os marcadores depois de gravados (o canal `markers.list` já existe e está testado, só sem UI
  consumindo ainda) nem edição/exclusão de um marcador já criado.
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

## Próximo passo

Duas frentes identificadas, ambas fora do escopo desta fase de captura:

1. **Exportação em múltiplos formatos** (pedido explícito do usuário) — hoje a gravação é sempre
   `.webm` (único formato que o `MediaRecorder` do Chromium produz de forma confiável); entregar
   um arquivo em MP4/MP3/WAV/M4A-AAC/AVI/MPEG/OGG exige uma etapa real de conversão via FFmpeg
   (`main/media/ffmpeg/` hoje é só um wrapper `spawn()` + `buildFfprobeArgs`, nenhum binário
   instalado, `export.start` sempre lança `NotImplementedError`) - feature nova e maior,
   correspondendo à Fase 4 - Export do roadmap (EXP-001..009), a ser planejada separadamente.
2. Continuar a **Fase 1 — Recording Core** (`11_ROADMAP_BACKLOG.md`): REC-015 (monitor de
   disco/RF-042) — última pendência da fase. As quatro fontes de captura, a segmentação por
   tempo/tamanho, pausar/retomar (RF-010) e marcadores (RF-016) já estão implementados e testados.
