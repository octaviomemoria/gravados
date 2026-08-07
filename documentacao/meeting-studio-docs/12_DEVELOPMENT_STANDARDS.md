# Padrões de Desenvolvimento

## 1. Linguagem

TypeScript com strict mode.

Evitar `any`.

## 2. Organização sugerida

```text
src/
  main/
    ipc/
    recording/
    media/
    db/
    services/
    security/
  preload/
  renderer/
    app/
    features/
      recording/
      library/
      editor/
      exports/
    components/
  shared/
    contracts/
    types/
    schemas/
```

## 3. Contratos IPC

Definir schemas compartilhados.

Recomendação: Zod ou validação equivalente.

IPC sem validação é proibido.

## 4. Services

Domínio não deve depender diretamente de Electron quando não for necessário.

Exemplo:

```ts
interface ProjectRepository {}
interface SegmentWriter {}
interface MediaProbe {}
```

## 5. Erros

Criar erros de domínio:

```ts
DiskSpaceError
DeviceUnavailableError
PermissionDeniedError
MediaFinalizeError
ExportFailedError
```

## 6. Logs

Logs estruturados.

Campos úteis:

- projectId;
- trackId;
- segmentId;
- jobId;
- operation;
- durationMs;
- errorCode.

## 7. Commits

Preferir Conventional Commits:

```text
feat(recording): add time based segment rotation
fix(recovery): reconcile unfinished screen segment
test(editor): cover remove range undo
```

## 8. Branches

Feature branch curta.

Evitar mudanças gigantes misturando refactor + feature.

## 9. Pull requests

Descrever:

- objetivo;
- requisito;
- solução;
- riscos;
- como testar;
- screenshots quando UI.

## 10. Testes

Bug importante exige teste de regressão quando viável.

## 11. Comentários

Comentar "por quê", não repetir o código.

## 12. TODO

TODO deve incluir referência:

```ts
// TODO(AI-015): support transcript-based range deletion.
```

## 13. Performance

Evitar:

- serializar blobs grandes para JSON;
- copiar buffers desnecessariamente;
- setState a cada frame;
- bloquear renderer com FFmpeg;
- waveform completa no main thread.

## 14. Arquivos grandes

Source media não entra em Git.

`.gitignore` deve incluir artefatos e mídia local de teste.

## 15. Configuração

Criar `.env.example`.

Nunca criar `.env` com segredo real no repositório.

## 16. Dependências

Antes de adicionar dependência:

1. justificar;
2. verificar manutenção;
3. verificar licença;
4. avaliar bundle/native build;
5. evitar dependência por utilitário trivial.
