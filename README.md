# Meeting Studio

> Nome de trabalho — pode mudar sem impacto arquitetural (`00_README.md`).

Aplicativo desktop para gravação, edição, organização e análise inteligente de reuniões.
Local-first, não destrutivo, recuperável. Windows-first no MVP, sem dependências que impeçam
suporte futuro a macOS.

Este repositório está atualmente na **Fase 0 — Bootstrap e Fundação Técnica**: fundação
arquitetural (Electron/React/TypeScript/Vite, IPC tipado e validado, SQLite+Drizzle, segurança de
processo, sistema de jobs, logging, testes/CI). **Nenhuma gravação real de tela/câmera/microfone
ainda existe** — isso é escopo da Fase 1 (ver [Roadmap](#próximo-passo)).

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

## Testes

- **Vitest** (`tests/unit/`): máquina de estados de gravação e de jobs, filesystem/escrita atômica,
  construção de argumentos FFmpeg, wrapper de IPC (validação/erro/sucesso), schemas Zod, erros de
  domínio, migrations (tabelas/índices/FKs), repositórios (project/settings/export-job), serviço de
  configurações, store de tema, smoke test de componente (jsdom).
- **Playwright** (`tests/e2e/`): abertura do app + título + sidebar + zero erros de console + banco
  criado em `userData` (`app-launch.spec.ts`); navegação por todas as rotas da sidebar
  (`navigation.spec.ts`).

## Pendências conhecidas

- Gravação real (tela/câmera/microfone/áudio do sistema), editor, transcrição/IA, exportação real,
  empacotamento (`electron-builder`) e nuvem/colaboração — todos fora do escopo desta fase por
  desenho (ver `11_ROADMAP_BACKLOG.md`).
- Sem seletor de pasta nativo nas Configurações (a pasta padrão da biblioteca é somente leitura
  nesta fase).
- CI (`.github/workflows/ci.yml`) só roda de fato quando o repositório for enviado a um remoto
  GitHub — a estrutura já existe localmente.

## Próximo passo

**Fase 1 — Recording Core** (`11_ROADMAP_BACKLOG.md`), começando por device enumeration e preview
(REC-001 a REC-004: listar telas/câmeras/microfones via `desktopCapturer`/`navigator.mediaDevices`
+ preview), pré-requisito de tudo o mais na fase (state machine real, chunk persistence,
segmentação, pause/resume, disk monitor, stop/finalize) — já scaffolded nesta fase, mas não
implementado.
