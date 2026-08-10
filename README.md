# Meeting Studio

> Nome de trabalho — pode mudar sem impacto arquitetural (`00_README.md`).

Aplicativo desktop para gravação, edição, organização e análise inteligente de reuniões.
Local-first, não destrutivo, recuperável. Windows-first no MVP, sem dependências que impeçam
suporte futuro a macOS.

A **Fase 0 — Bootstrap e Fundação Técnica** está completa: fundação arquitetural
(Electron/React/TypeScript/Vite, IPC tipado e validado, SQLite+Drizzle, segurança de processo,
sistema de jobs, logging, testes/CI). A **Fase 1 — Recording Core** está em andamento:
REC-001 a REC-004 (dispositivos + preview) e um pipeline de captura real com **microfone e
câmera simultâneos** (trilhas independentes) já funcionam de ponta a ponta (gravar → persistir
em disco continuamente → finalizar). Ver [Dispositivos e preview](#dispositivos-e-preview-fase-1)
e [Captura real de microfone e câmera](#captura-real-de-microfone-e-câmera-fase-1). Tela (exige API
não-padrão do Chromium), áudio do sistema, segmentação, pausa/retomada e marcadores ainda não
existem — próximos incrementos da Fase 1.

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

## Testes

- **Vitest** (`tests/unit/`): máquina de estados de gravação e de jobs, `RecordingSessionManager`
  de ponta a ponta multi-trilha (start/appendChunk/stop reais, microfone+câmera+tela+áudio do
  sistema simultâneos e independentes, escrita em disco, manifest, DB, chunks fora de ordem,
  falhas, trilha registrada que nunca recebe chunk algum), filesystem/escrita atômica, construção
  de argumentos FFmpeg, classificação de fontes de tela, cálculo de nível de áudio (RMS),
  formatação de tempo decorrido, wrapper de IPC (validação/erro/sucesso), schemas Zod, erros de
  domínio, migrations (tabelas/índices/FKs), repositórios (project/settings/export-job), serviço
  de configurações, store de tema, smoke test de componente (jsdom). **92 testes, 20 arquivos.**
- **Playwright** (`tests/e2e/`): abertura do app + título + sidebar + zero erros de console + banco
  criado em `userData` (`app-launch.spec.ts`); navegação por todas as rotas da sidebar
  (`navigation.spec.ts`); **gravação real de microfone + câmera**, **tela + microfone** e **áudio
  do sistema + microfone**, cada par de ponta a ponta com dispositivos de áudio/vídeo sintéticos do
  Chromium (câmera/microfone) e captura real de tela/áudio do sistema, verificando os arquivos de
  segmento gravados em disco via `expect.poll` (`recording.spec.ts`, ver decisões registradas #22
  sobre não empilhar todas as trilhas num único teste, #23 sobre timeouts/retries e #25 sobre o
  emparelhamento áudio+vídeo do áudio do sistema). **13 testes**, validados estáveis (todos os
  testes passam, com a flakiness já conhecida e documentada do cenário microfone+câmera absorvida
  pelos retries) em 3 execuções completas consecutivas da suíte.

## Pendências conhecidas

- Segmentação por tempo/tamanho, pause/resume, marcadores, monitor de disco, editor, transcrição/
  IA, exportação real, empacotamento (`electron-builder`) e nuvem/colaboração — fora do escopo
  desta fase por desenho (ver `11_ROADMAP_BACKLOG.md`).
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

Continuar a **Fase 1 — Recording Core** (`11_ROADMAP_BACKLOG.md`): as quatro fontes de captura
(tela, câmera, microfone, áudio do sistema) já estão implementadas e testadas em pares reais +
quarteto sintético. Próximos itens do roadmap: REC-011/012 (segmentação por tempo/tamanho -
rotação de segmento, hoje sempre um único arquivo por trilha), REC-013 (pause/resume), REC-014
(marcadores) e REC-015 (monitor de disco/RF-042).
