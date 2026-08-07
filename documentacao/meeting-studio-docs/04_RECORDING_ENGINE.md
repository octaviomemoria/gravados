# Recording Engine

## 1. Objetivo

O recording engine é a parte mais crítica do produto.

Regra:

> Uma interface bonita não compensa uma gravação perdida.

## 2. Fontes

Identificadores lógicos:

- `screen`;
- `camera`;
- `microphone`;
- `system_audio`;
- `composite_preview`.

O `composite_preview` não substitui os sources originais.

## 3. Fluxo

```text
prepare
  ↓
validate devices
  ↓
validate disk
  ↓
create project
  ↓
create tracks
  ↓
start MediaRecorders
  ↓
chunks
  ↓
IPC
  ↓
append/persist
  ↓
rotate segments
  ↓
update manifest
```

## 4. Chunking

O MediaRecorder deve entregar dados em intervalos curtos.

Princípios:

- chunks pequenos;
- transferência imediata;
- buffer limitado;
- backpressure monitorado;
- nunca manter horas de dados no renderer.

O intervalo exato deve ser medido em testes. Começar com ~1 segundo e ajustar com benchmark.

## 5. Segmentação por tempo

Separar arquivos lógicos em intervalos configurados.

Exemplo:

```text
screen_000001.webm
screen_000002.webm
screen_000003.webm
```

Cada segmento registra:

- index;
- startedAt;
- endedAt;
- durationMs;
- byteSize;
- checksum opcional;
- finalized.

## 6. Segmentação por tamanho

Como o bitrate varia, o limite é aproximado.

Algoritmo:

1. acumular `byteSize` persistido;
2. ao cruzar o threshold:
   - solicitar rotação;
   - finalizar segmento;
   - iniciar próximo;
3. registrar tamanho final.

Não tentar prever o tamanho somente pela duração.

## 7. Manifest

Cada projeto terá `manifest.json`.

Exemplo:

```json
{
  "schemaVersion": 1,
  "projectId": "01...",
  "status": "RECORDING",
  "startedAt": "...",
  "tracks": [
    {
      "id": "...",
      "type": "screen",
      "segments": []
    }
  ]
}
```

O manifest deve ser gravado atomicamente:

1. escrever arquivo temporário;
2. flush;
3. rename/substituição.

## 8. Recuperação

Na inicialização:

1. procurar manifests incompletos;
2. validar arquivos;
3. executar ffprobe quando necessário;
4. fechar segmentos recuperáveis;
5. marcar projeto `RECOVERABLE`;
6. permitir ao usuário recuperar.

Nunca apagar automaticamente uma gravação incompleta.

## 9. Sincronização

Todas as tracks devem compartilhar referência temporal do projeto.

Persistir:

- project clock;
- track start offset;
- pause intervals;
- segment timestamp range.

## 10. Pausa

A pausa deve ser modelada explicitamente.

```text
recording:
0s────────100s [pause] 130s────────200s

project timeline:
0s────────100s          100s────────170s
```

Decidir se a timeline editorial comprime as pausas. Recomendação: sim, mas manter timestamps absolutos nos metadados.

## 11. Falta de disco

Thresholds iniciais sugeridos:

- warning;
- critical;
- stop-safe.

No nível crítico:

1. avisar;
2. finalizar segmentos corretamente;
3. encerrar captura de forma controlada.

## 12. Erros de dispositivo

Se webcam falhar, o app deve tentar manter áudio/tela.

Não transformar falha de uma fonte secundária em perda integral da sessão.

## 13. Qualidade

Presets:

### Economy

- 720p;
- 30fps;
- bitrate moderado.

### Standard

- 1080p;
- 30fps.

### High

- 1080p;
- 60fps quando suportado.

Não prometer 4K no MVP antes de testes de CPU/GPU/disco.

## 14. Preview versus source

O preview pode ter resolução reduzida.

Nunca usar o preview como source principal de gravação se isso reduzir a qualidade do source.

## 15. Critérios críticos

- RAM não cresce proporcionalmente à duração;
- arquivo finalizado continua válido se o app cair depois;
- segmentos anteriores permanecem reproduzíveis;
- recovery detecta projeto incompleto;
- timestamps permanecem alinhados.
