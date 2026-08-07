# Modelo de Dados

## 1. Objetivo

Separar metadados transacionais da mídia.

SQLite guarda estrutura. Filesystem guarda arquivos grandes.

## 2. Entidades

### Project

```ts
type Project = {
  id: string;
  title: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  status: ProjectStatus;
  rootPath: string;
  notes?: string;
};
```

### Track

```ts
type Track = {
  id: string;
  projectId: string;
  type: "SCREEN" | "CAMERA" | "MICROPHONE" | "SYSTEM_AUDIO";
  enabled: boolean;
  order: number;
  startOffsetMs: number;
};
```

### Segment

```ts
type Segment = {
  id: string;
  trackId: string;
  index: number;
  relativePath: string;
  startedAtMs: number;
  endedAtMs?: number;
  durationMs?: number;
  byteSize: number;
  mimeType: string;
  finalized: boolean;
};
```

### Marker

```ts
type Marker = {
  id: string;
  projectId: string;
  timestampMs: number;
  title?: string;
  note?: string;
};
```

### EditProject

```ts
type EditProject = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
};
```

### EditOperation

```ts
type EditOperation = {
  id: string;
  editProjectId: string;
  sequence: number;
  type: string;
  startMs?: number;
  endMs?: number;
  trackId?: string;
  payloadJson: string;
};
```

### ExportJob

```ts
type ExportJob = {
  id: string;
  editProjectId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
  progress: number;
  outputPath?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
};
```

### Transcript

```ts
type Transcript = {
  id: string;
  projectId: string;
  provider: string;
  model: string;
  language?: string;
  createdAt: string;
};
```

### TranscriptSegment

```ts
type TranscriptSegment = {
  id: string;
  transcriptId: string;
  startMs: number;
  endMs: number;
  speaker?: string;
  text: string;
  confidence?: number;
};
```

## 3. Settings

Separar:

- application settings;
- recording presets;
- export presets;
- AI provider settings.

Segredos não devem ficar em texto puro no SQLite.

## 4. Migrations

Toda alteração de schema precisa de migration versionada.

Nunca executar alteração ad hoc na inicialização.

## 5. Integridade

Quando um arquivo estiver ausente:

- não apagar registro automaticamente;
- marcar health/status;
- permitir relink futuro.

## 6. Caminhos

Persistir preferencialmente caminho relativo ao `rootPath` do projeto.

Isso facilita mover o projeto.

## 7. Manifest e SQLite

O manifest funciona como mecanismo de recuperação independente.

SQLite é a visão normal da aplicação.

Fluxo após crash:

```text
manifest
  ↓
recovery
  ↓
reconcile
  ↓
SQLite
```

## 8. Indexes

Criar índices em:

- projects.createdAt;
- projects.status;
- tracks.projectId;
- segments.trackId/index;
- markers.projectId/timestampMs;
- transcriptSegments.transcriptId/startMs;
- exportJobs.status.
