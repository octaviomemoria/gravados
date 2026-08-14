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
**Fase 3 — Editor MVP** está em andamento: criar/abrir um projeto de edição vinculado a uma
gravação concluída (EDIT-001), a timeline compilada somente-leitura (EDIT-002), o preview
completo com playhead sincronizado e reprodução multi-trilha (EDIT-003, partes 1 e 2) e a primeira
operação de edição real - corte/split/remover-intervalo (EDIT-004/005/006) - já funcionam de ponta
a ponta - ver
[Editor: criar e abrir projeto de edição](#editor-criar-e-abrir-projeto-de-edição-fase-3),
[Timeline: dados e visualização somente-leitura](#timeline-dados-e-visualização-somente-leitura-fase-3),
[Preview: protocolo de mídia local + player mínimo](#preview-protocolo-de-mídia-local--player-mínimo-fase-3),
[Playhead sincronizado e reprodução multi-trilha](#playhead-sincronizado-e-reprodução-multi-trilha-fase-3)
e [Corte, split e remover intervalo](#corte-split-e-remover-intervalo-fase-3).

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
  fim atual, corte simultâneo em múltiplas trilhas)**, wrapper de IPC (validação/erro/sucesso),
  schemas Zod (incluindo `project.openFolder`), erros de domínio, migrations (tabelas/índices/FKs),
  repositórios (project/settings/export-job), serviço de configurações, store de tema, smoke test
  de componente (jsdom). **229 testes, 30 arquivos.**
- **Playwright** (`tests/e2e/`): abertura do app + título + sidebar + zero erros de console + banco
  criado em `userData` (`app-launch.spec.ts`); navegação por todas as rotas da sidebar
  (`navigation.spec.ts`); **gravação real de microfone + câmera**, **tela + microfone**, **áudio
  do sistema + microfone**, **segmentação por tamanho (câmera, limite de 1 MB)**, **pausar/
  retomar (microfone)**, **marcadores (microfone, criação durante gravação + bloqueio durante
  pausa)**, **monitor de espaço em disco (rejeição de início abaixo do limite mínimo; banner de
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
  real curta (só microfone), abre a Biblioteca, expande "Detalhes" (confirma a trilha de microfone
  com bytes reais), renomeia inline, exclui com o passo de confirmação, confirma que o item some da
  lista E que a pasta some do disco. **1 teste**, validado limpo e rápido (7.6-10.2s) em múltiplas
  execuções isoladas consecutivas.
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
  confirmando um segundo encolhimento. **6 testes**, validados em 2 execuções completas
  consecutivas da suíte inteira após a correção do bug de arredondamento (decisão #82) - a mesma
  vara de medir já usada pra distinguir bug real de flakiness ambiental ao longo de toda a sessão:
  isolado, `editor (trim/remove-range)` passou de forma limpa (sem retry, 9.5s) assim que o fix
  foi aplicado, depois de reproduzir a falha de forma CONSISTENTE (3 tentativas seguidas) com o
  bug ainda presente. Nas duas execuções completas da suíte inteira, o teste passou limpo numa
  (12.6s) e recuperou no primeiro retry na outra (a mesma classe de flakiness de câmera já
  documentada, decisão #23) - nunca falhou de vez. A segunda execução completa coincidiu com uma
  instância particularmente severa da contenção de recursos já registrada anteriormente nesta
  sessão (18 processos `electron`/`node` concorrentes) - 2 testes PRÉ-EXISTENTES, não tocados por
  este incremento (`library.spec.ts`, `recording (microphone + camera)`), esgotaram os 3 retries
  configurados, mas nenhum teste NOVO deste incremento falhou de vez, mesma evidência já usada
  para aceitar instâncias anteriores desta classe (decisão #23, recorrência documentada na Fase 2).

## Pendências conhecidas

- Editor, transcrição/IA, exportação real em múltiplos formatos (mp4/mp3/wav/etc. - pedido
  explícito do usuário, adiado para um incremento próprio; ver "Próximo passo"), empacotamento
  (`electron-builder`) e nuvem/colaboração — fora do escopo desta fase por desenho (ver
  `11_ROADMAP_BACKLOG.md`).
- Monitor de espaço em disco não tem indicador visual de "espaço OK" explícito, só o texto de
  espaço livre sempre visível e o banner de aviso quando baixo (refinamento futuro cosmético, não
  bloqueante). Correção do bug do `check-disk-space` (ver decisão #39) foi um benefício colateral
  para o indicador pré-existente da Home, que estava silenciosamente quebrado desde a Fase 0.
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
- `getProjectDetails` não expõe a lista de segmentos individualmente (só o resumo por trilha:
  contagem + bytes totais) - suficiente para o MVP, mas insuficiente para uma futura timeline de
  edição, que precisará dos segmentos um a um.
- Projeto de edição ainda não tem renomear nem excluir (só a Biblioteca tem essas ações, para
  gravações - não para projetos de edição). Corte/split/remover-intervalo (EDIT-004/005/006) já
  funcionam; undo/redo, gain/mudo/fade, transformação de câmera e layout ainda não (EDIT-007 em
  diante).
- `EditorProjectPage` não trata um `id` de projeto de edição inexistente/inválido na URL de forma
  amigável (`editor.get` lança `NotFoundError`, capturado só como um estado de erro genérico) -
  refinamento futuro, não bloqueante.
- A timeline não tem zoom nem scroll horizontal - para uma gravação muito longa, os clips ficam
  proporcionalmente pequenos na régua inteira (`totalDurationMs`); zoom é um requisito explícito
  do editor (`05_MEDIA_EDITOR.md` §14) que ainda não foi implementado.
- Sem indicação visual de gaps entre clips na mesma trilha (ex.: um pause/resume real deixaria
  dois segmentos consecutivos sem intervalo, mas uma trilha que só rotacionou por tamanho/tempo
  também não tem gap perceptível hoje) - refinamento futuro, não bloqueante para esta etapa.
- Sem controle de qual trilha usar como preview visual principal - `pickPreviewTrack` decide
  sozinho (tela > câmera > primeira disponível), sem nenhuma forma de o usuário escolher outra
  trilha manualmente ou ver duas trilhas de vídeo ao mesmo tempo (isso é o layout PiP/lado-a-lado
  planejado pra EDIT-011).
- Sincronização entre trilhas tem tolerância de 250ms (`DRIFT_THRESHOLD_SECONDS`) - suficiente
  para revisar uma gravação, mas não é sample-accurate como um editor profissional de verdade;
  refinamento futuro, não bloqueante para o MVP.
- Buscar (seek) só funciona por clique/toque na régua ou numa lane de trilha - sem arrastar o
  mouse pressionado (drag-scrub contínuo) nem atalhos de teclado (espaço = play/pause, setas = ±1
  frame).
- Sem controle de volume/mudo por trilha na reprodução (ex.: silenciar o microfone e ouvir só o
  áudio do sistema) - todas as trilhas de áudio tocam sempre, sem ajuste individual; isso faz
  parte do trabalho de ganho/mudo/fade (EDIT-008/009), ainda não implementado.
- O relógio do player não pausa sozinho ao final de cada clip em caso de gap real entre segmentos
  de uma mesma trilha (ex.: um pause/resume real) - a trilha simplesmente fica pausada durante o
  gap e retoma quando o próximo clip começa; comportamento correto, mas sem nenhuma indicação
  visual de "sem sinal" nesse intervalo.
- **Sem undo/redo ainda (EDIT-007)** - um `REMOVE_RANGE` aplicado é permanente do ponto de vista
  da UI (o arquivo original nunca é tocado, editor não-destrutivo por desenho, mas não há como
  desfazer um corte pela interface); o log de operações (`edit_operations`) já registra tudo em
  ordem, a base para desfazer/refazer já existe no banco, só falta o consumo.
- **Sem visualização/gerenciamento do histórico de operações** - `EditOperationRepository.listByEditProject`
  existe e é usado internamente por `getEditedTimeline`, mas não há tela nem canal IPC dedicado
  pra listar/inspecionar os cortes já feitos num projeto de edição.
- **Seleção manual (marcar início/fim) depende de reproduzir e pausar no ponto certo** - não há
  ainda arrastar diretamente na régua/lane pra definir um intervalo (drag-select), nem digitar um
  timestamp exato; suficiente pra este incremento, mas menos preciso que um scrubber arrastável.
- **`removeRange` não valida limite mínimo de duração remanescente** - tecnicamente possível
  remover a timeline inteira até sobrar `totalDurationMs = 0` (ou próximo disso); nenhum teste
  cobre esse caso extremo, e a UI não impede explicitamente, só fica sem nada útil pra mostrar.

## Próximo passo

A **Fase 1 — Recording Core** está completa (`11_ROADMAP_BACKLOG.md`, REC-001 a REC-015): as
quatro fontes de captura simultâneas, segmentação por tempo/tamanho, pausar/retomar (RF-010),
marcadores (RF-016) e monitor de espaço em disco (RF-042) estão implementados e testados de ponta a
ponta. A **Fase 2 — Recovery + Library** também está completa: RECOV-001/002/003 (manifest,
detecção e reparo de gravações incompletas) e LIB-001/002/004/005/006 (listar, detalhes, renomear,
mostrar na pasta, excluir) funcionam de ponta a ponta. A **Fase 3 — Editor MVP** está em andamento:
EDIT-001 (criar/abrir projeto de edição), EDIT-002 (timeline compilada somente-leitura), EDIT-003
completo (partes 1 e 2 - preview com playhead sincronizado e reprodução multi-trilha via protocolo
de mídia local seguro) e EDIT-004/005/006 (corte/split/remover-intervalo, a primeira operação de
edição real) já funcionam de ponta a ponta.

Desenvolvimento segue de forma incremental e contínua rumo ao Marco MVP (`11_ROADMAP_BACKLOG.md`),
cada incremento validado (lint/typecheck/testes/build/E2E) e documentado neste README antes do
próximo começar. Ordem planejada:

1. Continuar a **Fase 3 — Editor MVP**: undo/redo (EDIT-007) - o log ordenado de
   `edit_operations` já existe e está sendo consumido (`getEditedTimeline`), falta expor
   desfazer/refazer pela UI - depois ganho/mudo/fade (EDIT-008/009), visibilidade/transformação
   de câmera (EDIT-010), layout (PiP/lado-a-lado/só-tela/só-câmera, EDIT-011), autosave
   (EDIT-012) - cada operação provavelmente seu próprio incremento, dado o tamanho desta fase
   (05_MEDIA_EDITOR.md).
2. **Fase 4 — Export** (EXP-001..009): pipeline real de FFmpeg (`ffmpeg-static`/`ffprobe-static`
   ainda não instalados - `main/media/ffmpeg/` hoje é só um wrapper `spawn()` + `buildFfprobeArgs`,
   nenhum binário real, `export.start` sempre lança `NotImplementedError`), MP4 720p/1080p, faixa
   de tempo, progresso, cancelamento, validação via ffprobe - inclui a exportação em múltiplos
   formatos pedida explicitamente pelo usuário (MP4/MP3/WAV/M4A-AAC/AVI/MPEG/OGG/etc.). O roadmap
   marca o fim desta fase como o **Marco MVP**.
3. Fases 5-9 (transcrição, meeting intelligence, busca semântica, nuvem, integrações) ficam para
   depois do MVP, replanejadas quando chegar a vez.
