# Arquitetura Técnica

## 1. Estratégia

Aplicativo desktop local-first em arquitetura Electron multiprocess.

```text
┌───────────────────────────────────────────────┐
│                  Renderer                     │
│ React + UI + Preview + Timeline               │
└──────────────────────┬────────────────────────┘
                       │ contextBridge / IPC
┌──────────────────────▼────────────────────────┐
│                   Main                        │
│ lifecycle, devices, files, permissions, DB    │
└─────────────┬──────────────────┬──────────────┘
              │                  │
      ┌───────▼──────┐   ┌──────▼────────┐
      │ Media Worker │   │ Export Worker │
      │ persistence  │   │ FFmpeg        │
      └───────┬──────┘   └──────┬────────┘
              │                  │
      ┌───────▼──────────────────▼────────┐
      │ Local Files + SQLite + Manifests  │
      └───────────────────────────────────┘
```

## 2. Processos

### Main process

Responsável por:

- lifecycle;
- janelas;
- permissões;
- caminhos de filesystem;
- IPC;
- banco;
- gerenciamento do FFmpeg;
- recuperação.

### Renderer

Responsável por:

- UI;
- configuração;
- preview;
- controles;
- biblioteca;
- editor visual;
- timeline.

O renderer não deve receber permissões irrestritas de filesystem.

### Preload

Expor API mínima e tipada:

```ts
window.meetingStudio.recording.start(...)
window.meetingStudio.recording.stop(...)
window.meetingStudio.library.list(...)
window.meetingStudio.export.start(...)
```

Nunca expor `ipcRenderer` genérico diretamente.

## 3. Captura

Electron disponibiliza `desktopCapturer` e integração com `getDisplayMedia`.

No Windows, o plano é:

1. selecionar source;
2. obter display stream;
3. obter camera stream;
4. obter microphone stream;
5. obter system audio/loopback quando habilitado;
6. gravar tracks;
7. enviar chunks ao processo responsável por persistência.

Referência:
https://www.electronjs.org/docs/latest/api/desktop-capturer/

## 4. Segurança do Electron

BrowserWindow recomendado:

```ts
{
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload
  }
}
```

Qualquer exceção precisa ser documentada.

## 5. Persistência

### SQLite

Guardar:

- projetos;
- tracks;
- segments;
- markers;
- edit operations;
- exports;
- transcript metadata;
- settings.

### Filesystem

Guardar mídia em estrutura independente do banco.

```text
MeetingStudio/
  projects/
    <project-id>/
      manifest.json
      source/
        screen/
        camera/
        microphone/
        system-audio/
      proxies/
      thumbnails/
      exports/
      recovery/
```

O banco referencia caminhos relativos.

## 6. IDs

Usar UUID/ULID gerado localmente para:

- project;
- track;
- segment;
- marker;
- edit operation;
- export job.

## 7. FFmpeg

FFmpeg deve ser tratado como subsistema.

Responsabilidades:

- ffprobe;
- normalização/conversão;
- proxy;
- composição;
- concatenação;
- corte;
- filtros;
- render final.

Não executar comandos arbitrários vindos da UI. Construir comandos por funções tipadas.

## 8. Jobs

Operações pesadas devem usar job model:

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELED
```

Aplicável a:

- proxy;
- waveform;
- thumbnail;
- export;
- transcrição;
- indexação.

## 9. Estado da gravação

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

Transições devem ser explícitas e testadas.

## 10. Estratégia de dependências

- preferir bibliotecas maduras;
- minimizar dependências nativas;
- encapsular FFmpeg;
- pin de versões;
- atualização controlada.

## 11. Portabilidade

### Windows

Alvo do MVP.

### macOS

Exige tratamento específico de permissões de câmera, microfone, tela e captura de áudio. Documentação atual do Electron registra requisitos adicionais para captura de áudio em versões recentes do macOS.

### Linux

Tratar depois do MVP. PipeWire possui particularidades de seleção de fonte.

## 12. ADRs iniciais

### ADR-001 — Electron

Escolhido pela integração com APIs web de mídia, desktop capture e ecossistema de UI.

### ADR-002 — Local-first

O núcleo do produto funciona offline.

### ADR-003 — Edição não destrutiva

O editor salva instruções, não altera os sources.

### ADR-004 — Trilhas separadas

Fontes devem ser independentes para viabilizar edição posterior.

### ADR-005 — FFmpeg para render

Evitar reinventar pipeline de codecs.
