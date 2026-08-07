# Estratégia de Testes e QA

## 1. Pirâmide

### Unit

- state machines;
- segment rotation;
- timeline math;
- edit operations;
- path validation;
- render plan;
- manifest reconciliation.

### Integration

- DB repositories;
- IPC;
- FFmpeg wrapper;
- file writer;
- recovery service.

### E2E

- criar reunião;
- iniciar;
- pausar;
- parar;
- biblioteca;
- editor;
- exportar.

## 2. Testes críticos do recording engine

### T-REC-001

Gravar por 5 minutos e validar que RAM estabiliza.

### T-REC-002

Forçar segmentação a cada 30 segundos.

### T-REC-003

Forçar segmentação por tamanho baixo.

### T-REC-004

Encerrar processo abruptamente e recuperar.

### T-REC-005

Desconectar webcam durante gravação.

### T-REC-006

Desconectar microfone.

### T-REC-007

Encher disco simulado.

### T-REC-008

Trocar resolução entre sessões.

### T-REC-009

Pausar/retomar múltiplas vezes.

### T-REC-010

Gravação longa de soak test.

## 3. Editor

- trim;
- split;
- remove range;
- undo/redo;
- gain;
- mute;
- camera visibility;
- autosave;
- reopen.

## 4. Export

Validar com ffprobe:

- arquivo existe;
- duração esperada;
- streams esperados;
- resolução;
- áudio;
- timestamps.

## 5. Golden media tests

Manter pequenos arquivos de fixture no repositório ou gerá-los em teste.

Não armazenar fixtures gigantes.

## 6. Performance

Medir:

- CPU;
- RAM;
- disk write;
- dropped frames;
- queue backlog.

## 7. Hardware matrix

MVP Windows:

- notebook integrado;
- desktop;
- uma tela;
- duas telas;
- webcam USB;
- headset USB/Bluetooth;
- DPI 100/125/150%.

## 8. CI

Pipeline mínimo:

```text
install
lint
typecheck
unit tests
integration tests
build
```

E2E completo pode executar em job separado.

## 9. Definition of Done

Feature só está pronta se:

- requisito implementado;
- erros tratados;
- teste relevante;
- typecheck;
- lint;
- documentação atualizada;
- nenhum segredo;
- nenhuma regressão crítica conhecida.
