# IA, Transcrição e Knowledge Layer

> Fase posterior ao núcleo de gravação e edição.

## 1. Objetivos

Transformar áudio em:

- texto;
- resumo;
- decisões;
- tarefas;
- temas;
- conhecimento pesquisável.

## 2. Pipeline

```text
Project
 ↓
Audio preparation
 ↓
Transcription
 ↓
Diarization
 ↓
Transcript normalization
 ↓
Meeting analysis
 ↓
Summary / Decisions / Tasks
 ↓
Search index
```

## 3. Preparação de áudio

Antes de enviar a um provedor:

- extrair/mixar áudio;
- normalizar formato;
- opcionalmente reduzir bitrate;
- dividir quando necessário;
- preservar offsets.

## 4. OpenAI

A API de transcrição atualmente oferece modelos de transcrição e opção com diarização. A implementação deve encapsular o provedor atrás de uma interface.

Referência:
https://platform.openai.com/docs/api-reference/audio

Exemplo conceitual:

```ts
interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptResult>;
}
```

Não acoplar entidades do banco diretamente à resposta da API.

## 5. Timestamps

Timestamps são obrigatórios para:

- clicar no texto e navegar no vídeo;
- edição por texto;
- citações;
- highlights.

## 6. Diarização

Speaker IDs iniciais podem ser:

- Speaker 1;
- Speaker 2.

Permitir renomear depois.

## 7. Análise de reunião

Output estruturado:

```ts
type MeetingAnalysis = {
  executiveSummary: string;
  topics: Topic[];
  decisions: Decision[];
  actionItems: ActionItem[];
  risks: Risk[];
  questions: string[];
};
```

## 8. Anti-alucinação

O sistema deve separar:

- informação dita;
- inferência;
- campo não identificado.

Nunca inventar responsável ou prazo.

Quando ausente:

```text
responsável: não identificado
prazo: não identificado
```

## 9. Evidência

Cada decisão/tarefa importante deve poder apontar para:

- transcriptSegmentId;
- timestamp.

## 10. Pesquisa

### Fase 1

Full-text search local.

### Fase 2

Embeddings e busca semântica.

### Fase 3

Perguntas sobre múltiplas reuniões.

Resposta deve conter evidências:

```text
Reunião: ...
Data: ...
Timestamp: 00:38:14
```

## 11. Privacidade

Enviar conteúdo à nuvem somente após:

- usuário ativar a função;
- chave/provedor configurado;
- aviso de processamento externo.

## 12. Custos

Guardar métricas:

- duração transcrita;
- provider;
- model;
- uso retornado quando disponível.
