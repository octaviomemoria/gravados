# Media Editor

## 1. Princípio

Editor não destrutivo.

Os arquivos originais são imutáveis.

## 2. Conceitos

### Source

Mídia original.

### Track

Linha temporal lógica.

### Clip

Referência a um intervalo de source.

### Edit operation

Transformação lógica.

### Composition

Conjunto de tracks e propriedades visuais.

### Export

Renderização de uma composição.

## 3. Timeline

Tracks mínimas:

```text
SCREEN
CAMERA
MICROPHONE
SYSTEM AUDIO
MARKERS
TRANSCRIPT (futuro)
```

## 4. Operações do MVP

### Trim

Alterar início/fim útil.

### Split

Dividir clip em um ponto.

### Delete range

Remover intervalo.

### Mute

Silenciar áudio.

### Gain

Ajustar ganho.

### Fade

Fade-in e fade-out.

### Camera visibility

Exibir/ocultar webcam.

### Camera transform

- x;
- y;
- width;
- height;
- crop;
- shape.

### Layout presets

- PiP;
- side-by-side;
- screen only;
- camera only.

## 5. Operações futuras

- blur;
- zoom;
- textos;
- logos;
- overlays;
- imagens;
- transições;
- multicamera;
- background removal;
- smart crop.

## 6. Modelo de edição

Exemplo:

```json
{
  "operations": [
    {
      "id": "op1",
      "type": "REMOVE_RANGE",
      "startMs": 872000,
      "endMs": 921000
    },
    {
      "id": "op2",
      "type": "SET_GAIN",
      "trackId": "mic",
      "startMs": 1200000,
      "endMs": 1300000,
      "gainDb": 3
    }
  ]
}
```

## 7. Undo / Redo

Usar command pattern ou histórico de snapshots incrementais.

Requisitos:

- undo;
- redo;
- dirty state;
- autosave.

## 8. Autosave

Salvar operações automaticamente.

Nunca exigir clique em salvar para proteger horas de edição.

## 9. Proxy

Para vídeos grandes:

1. preservar source;
2. gerar proxy leve;
3. editar sobre proxy;
4. exportar usando source original.

## 10. Waveform

Gerar representação simplificada do áudio em processo background.

Persistir cache.

Não recalcular a waveform completa a cada abertura.

## 11. Preview

O preview não precisa renderizar com a mesma qualidade da exportação.

Prioridade:

- responsividade;
- precisão temporal;
- sincronização.

## 12. Exportação

Pipeline conceitual:

```text
Edit Model
  ↓
Timeline Compiler
  ↓
FFmpeg Plan
  ↓
Render Job
  ↓
Validation with ffprobe
  ↓
Output
```

## 13. Timeline Compiler

Criar camada intermediária.

Não gerar comandos FFmpeg diretamente a partir dos componentes React.

Exemplo:

```ts
type RenderPlan = {
  clips: RenderClip[];
  audio: AudioPlan[];
  overlays: OverlayPlan[];
  output: OutputSettings;
};
```

## 14. Seleção

Editor deve suportar:

- playhead;
- in/out;
- seleção de range;
- snap opcional;
- zoom horizontal.

## 15. Atalhos iniciais

- Space: play/pause
- S: split
- Delete: remover seleção
- Ctrl+Z: undo
- Ctrl+Shift+Z: redo
- M: marker

Atalhos não devem disparar enquanto o foco estiver em campos de texto.

## 16. Edição por texto — fase IA

A transcrição possui timestamps.

Quando o usuário remove palavras/segmentos, gerar operação `REMOVE_RANGE`.

Nunca modificar a transcrição sem preservar vínculo com timestamps de origem.
