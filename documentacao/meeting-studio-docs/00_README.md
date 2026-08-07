# Meeting Studio — Documentação Mestre

> Nome de trabalho do produto. Pode ser alterado sem impacto na arquitetura.

## 1. Visão geral

O Meeting Studio é um aplicativo desktop para gravação, edição, organização e análise de reuniões.

O produto deverá permitir:

- gravar microfone;
- gravar áudio do computador;
- gravar uma tela inteira;
- gravar uma janela específica;
- gravar webcam;
- gravar tela + webcam simultaneamente;
- manter as fontes originais em trilhas independentes;
- criar uma composição visual com tela e apresentador;
- dividir automaticamente as gravações por tempo ou tamanho;
- salvar continuamente os dados para reduzir risco de perda;
- recuperar gravações interrompidas;
- editar áudio e vídeo de forma não destrutiva;
- exportar o resultado;
- posteriormente transcrever, resumir e pesquisar reuniões usando IA.

## 2. Prioridade do projeto

A implementação deve seguir esta ordem:

1. Infraestrutura desktop.
2. Captura de dispositivos e tela.
3. Gravação robusta.
4. Segmentação e recuperação.
5. Biblioteca local.
6. Editor básico.
7. Exportação.
8. Testes e estabilização.
9. Transcrição e IA.
10. Nuvem e colaboração.

Não antecipar funcionalidades de fases posteriores se isso aumentar significativamente a complexidade do MVP.

## 3. Plataforma inicial

### MVP

- Windows 10/11.
- Aplicativo desktop.
- Operação local-first.
- Sem obrigatoriedade de login.
- Arquivos armazenados localmente.
- Processamento local sempre que possível.

### Futuro

- macOS.
- Linux.
- sincronização em nuvem;
- contas e equipes;
- compartilhamento;
- integrações com calendários;
- detecção de reuniões;
- busca semântica entre reuniões.

## 4. Stack recomendada

- Electron
- React
- TypeScript
- Vite
- Node.js LTS
- SQLite
- Drizzle ORM
- Zustand
- FFmpeg / FFprobe
- Vitest
- Playwright
- ESLint
- Prettier

As versões exatas devem ser fixadas no `package.json` e no lockfile no momento do bootstrap. Não usar dependências `latest` em código de produção.

## 5. Princípios técnicos

### Local-first

Uma gravação não deve depender de conexão com internet.

### Não destrutivo

Editar uma reunião nunca deve modificar os arquivos originais.

### Recuperável

Falhas do aplicativo ou do sistema não devem destruir toda a gravação.

### Trilhas independentes

Tela, webcam, microfone e áudio do sistema devem ser preservados separadamente sempre que tecnicamente possível.

### Processamento assíncrono interno

Renderizações e tarefas pesadas devem executar fora do renderer principal para não congelar a interface.

### Segurança

Renderer sem acesso direto irrestrito ao Node.js. Toda integração nativa deve usar APIs explícitas via preload/context bridge.

## 6. Estrutura desta documentação

| Arquivo | Conteúdo |
|---|---|
| `01_PRODUCT_VISION_PRD.md` | visão de produto e PRD |
| `02_FUNCTIONAL_REQUIREMENTS.md` | requisitos funcionais |
| `03_TECHNICAL_ARCHITECTURE.md` | arquitetura técnica |
| `04_RECORDING_ENGINE.md` | mecanismo de gravação |
| `05_MEDIA_EDITOR.md` | editor de áudio e vídeo |
| `06_DATA_MODEL.md` | modelo de dados |
| `07_AI_TRANSCRIPTION_KNOWLEDGE.md` | transcrição e IA |
| `08_UX_FLOWS.md` | telas e fluxos |
| `09_SECURITY_PRIVACY_COMPLIANCE.md` | segurança e privacidade |
| `10_TESTING_QA.md` | estratégia de testes |
| `11_ROADMAP_BACKLOG.md` | roadmap e backlog |
| `12_DEVELOPMENT_STANDARDS.md` | padrões de desenvolvimento |
| `13_ACCEPTANCE_CRITERIA.md` | critérios de aceite |
| `AGENTS.md` | instruções permanentes para Codex |
| `CODEX_START_PROMPT.md` | prompt inicial para começar a implementação |

## 7. Fontes técnicas oficiais

- Electron desktop capture: https://www.electronjs.org/docs/latest/api/desktop-capturer/
- Electron session permissions: https://www.electronjs.org/docs/latest/api/session
- Electron system preferences: https://www.electronjs.org/docs/latest/api/system-preferences
- FFmpeg documentation: https://ffmpeg.org/documentation.html
- FFmpeg formats/segmenter: https://ffmpeg.org/ffmpeg-formats.html
- OpenAI Audio API: https://platform.openai.com/docs/api-reference/audio

## 8. Regra para o Codex

Antes de implementar uma nova feature:

1. localizar o requisito nesta documentação;
2. identificar impactos em arquitetura e modelo de dados;
3. escrever ou atualizar testes;
4. implementar a menor solução que satisfaça os critérios;
5. executar lint, typecheck e testes;
6. registrar decisões arquiteturais relevantes.
