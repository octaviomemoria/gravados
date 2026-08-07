# UX, Telas e Fluxos

## 1. Navegação principal

```text
Home
├── Nova gravação
├── Biblioteca
├── Projetos de edição
├── Exportações
└── Configurações
```

## 2. Home

Elementos:

- botão "Nova gravação";
- gravações recentes;
- projetos recuperáveis;
- espaço disponível;
- jobs recentes.

## 3. Setup de gravação

### Fonte de vídeo

- tela/janela;
- câmera;
- preview.

### Fonte de áudio

- microfone;
- áudio do sistema;
- medidor.

### Qualidade

- preset;
- resolução;
- fps.

### Segmentação

- por tempo;
- por tamanho;
- sem rotação adicional.

### Layout

- PiP;
- side-by-side;
- screen-only;
- camera-only.

## 4. Estado gravando

Barra principal:

```text
● REC  00:42:18
Mic: ON
System: ON
Camera: ON
Screen: ON

[Pause] [Marker] [Stop]
```

Mostrar:

- duração;
- tamanho;
- espaço em disco;
- segmentos;
- fontes.

## 5. Stop

Confirmação simples.

Depois:

```text
Finalizando gravação...
✓ screen
✓ camera
✓ microphone
✓ system audio
✓ metadata
```

Não fechar a janela até o usuário desejar, mas bloquear ações destrutivas durante finalização.

## 6. Recovery

Card:

```text
Gravação não finalizada
07/08/2026 14:12
Duração recuperável: ~37 min

[Recuperar] [Ver arquivos]
```

Não oferecer "Excluir" como ação principal.

## 7. Biblioteca

Filtros futuros:

- data;
- nome;
- duração;
- tags;
- transcrita.

Ações:

- abrir;
- editar;
- exportar;
- renomear;
- mostrar no Explorer;
- excluir.

Excluir deve informar exatamente quais arquivos serão removidos.

## 8. Editor

Layout:

```text
┌───────────────────────────────────────┐
│ Toolbar                               │
├───────────────────────┬───────────────┤
│                       │ Inspector     │
│ Preview               │               │
│                       │               │
├───────────────────────┴───────────────┤
│ Timeline                              │
│ Screen    █████████████████           │
│ Camera    █████████████████           │
│ Mic       ▄▅▇▃▃▆██▅▄                 │
│ System    ▃▄▆██▇▅▄▃                  │
└───────────────────────────────────────┘
```

## 9. Export

Wizard simples:

- nome;
- destino;
- formato;
- resolução;
- qualidade;
- range.

Depois mostrar job.

## 10. Empty states

Não usar mensagens técnicas.

Exemplo:

> Nenhuma gravação ainda. Crie sua primeira reunião para começar.

## 11. Erros

Erro deve conter:

1. o que aconteceu;
2. impacto;
3. ação possível.

Evitar:

> Error code 0x8271.

Preferir:

> A webcam foi desconectada. Tela e áudio continuam sendo gravados.

## 12. Tema

Inicialmente:

- claro;
- escuro;
- seguir sistema.

A identidade visual não deve ser acoplada à lógica.
