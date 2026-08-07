# AGENTS.md — Instruções para Codex

## Missão

Construir o Meeting Studio conforme a documentação deste repositório.

Antes de alterar código, leia:

1. `00_README.md`
2. requisito relacionado em `02_FUNCTIONAL_REQUIREMENTS.md`
3. `03_TECHNICAL_ARCHITECTURE.md`
4. documento específico do módulo
5. `13_ACCEPTANCE_CRITERIA.md`

## Regras absolutas

1. Priorize confiabilidade da gravação.
2. Não destrua mídia original.
3. Não mantenha gravação inteira em RAM.
4. Não execute FFmpeg no renderer.
5. Não exponha Node.js diretamente ao renderer.
6. Não monte shell commands com input de usuário.
7. Não envie áudio/vídeo para serviços externos sem ação explícita.
8. Não implemente cloud antes do MVP local estar estável.
9. Não altere arquitetura silenciosamente.
10. Não remova testes para fazer build passar.

## Forma de trabalhar

Para cada tarefa:

### 1. Analise

Identifique:

- requisitos afetados;
- módulos;
- schema;
- IPC;
- filesystem;
- testes;
- risco de regressão.

### 2. Planeje

Se a mudança for relevante, escreva um plano curto antes de codificar.

### 3. Implemente

Prefira pequenas mudanças coesas.

### 4. Valide

Execute:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Quando houver E2E aplicável:

```bash
pnpm test:e2e
```

### 5. Reporte

Ao finalizar, informe:

- arquivos alterados;
- requisito implementado;
- testes executados;
- limitações;
- próximo passo sugerido.

## Arquitetura

Stack-alvo:

- Electron
- React
- TypeScript
- Vite
- SQLite
- Drizzle
- Zustand
- FFmpeg/FFprobe
- Vitest
- Playwright

Se houver incompatibilidade técnica comprovada, proponha alternativa antes de trocar.

## Recording

O engine deve ser uma máquina de estados.

Estados:

```text
IDLE
PREPARING
RECORDING
PAUSED
STOPPING
FINALIZING
COMPLETED
RECOVERABLE
FAILED
```

Mídia deve chegar ao disco continuamente.

## Editor

Editor é baseado em operações.

Nunca sobrescreva source.

## FFmpeg

Criar wrapper tipado.

Preferir `spawn(binary, args)`.

Nunca:

```ts
exec("ffmpeg " + userInput)
```

## Database

Toda mudança de schema exige migration.

## Segurança

BrowserWindow:

- contextIsolation true;
- nodeIntegration false;
- sandbox true quando compatível.

IPC deve ser validado.

## Scope

Não implementar por iniciativa própria:

- billing;
- SaaS;
- cloud;
- mobile;
- marketplace;
- redes sociais.

## Critério principal

Se houver duas soluções, escolha a que facilita:

- recuperação;
- teste;
- observabilidade;
- evolução futura;
- preservação dos dados do usuário.
