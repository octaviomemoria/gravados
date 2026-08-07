# Prompt inicial para o Codex

Quero iniciar o desenvolvimento do **Meeting Studio**, um aplicativo desktop Windows-first para gravação e edição de reuniões.

Toda a especificação do projeto está nos arquivos Markdown deste repositório. Considere essa documentação como fonte de verdade.

## Antes de codificar

Leia integralmente, no mínimo:

- `00_README.md`
- `01_PRODUCT_VISION_PRD.md`
- `02_FUNCTIONAL_REQUIREMENTS.md`
- `03_TECHNICAL_ARCHITECTURE.md`
- `04_RECORDING_ENGINE.md`
- `06_DATA_MODEL.md`
- `10_TESTING_QA.md`
- `11_ROADMAP_BACKLOG.md`
- `12_DEVELOPMENT_STANDARDS.md`
- `13_ACCEPTANCE_CRITERIA.md`
- `AGENTS.md`

## Objetivo desta primeira execução

Implemente **somente a Fase 0 — Bootstrap**.

Crie a fundação do projeto com:

- Electron;
- React;
- TypeScript strict;
- Vite;
- pnpm;
- ESLint;
- Prettier;
- Vitest;
- Playwright preparado;
- SQLite;
- Drizzle ORM;
- migrations;
- Zustand;
- estrutura de pastas definida na documentação;
- preload com `contextBridge`;
- contratos IPC tipados e validados;
- configuração segura da BrowserWindow;
- logging;
- tratamento global de erros;
- `.env.example`;
- `.gitignore`;
- scripts de lint, typecheck, test e build;
- README técnico com instruções para rodar o projeto.

## Importante

Não implemente ainda gravação de tela, câmera ou áudio.

Nesta etapa queremos uma base sólida e testável.

## Entregáveis

Ao concluir:

1. mostre a estrutura criada;
2. explique decisões técnicas relevantes;
3. liste dependências;
4. execute lint;
5. execute typecheck;
6. execute testes;
7. execute build;
8. corrija os erros encontrados;
9. informe claramente qualquer limitação.

Depois proponha a próxima tarefa correspondente ao início da **Fase 1 — Recording Core**, mas não a implemente sem nova solicitação.
