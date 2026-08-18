import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.schema'
import { JOB_STATUSES } from '../../../shared/types/job'

/**
 * AI-001 (Fase 5 — Transcrição, `06_DATA_MODEL.md` "Transcript"/"TranscriptSegment").
 *
 * Tres tabelas, nao uma so, espelhando a mesma separacao ja usada em `export_jobs` (rastreio do
 * PROCESSO assincrono) vs. o arquivo final (nunca modelado como linha de banco - so um caminho no
 * disco). Transcricao difere de export nesse ponto: o RESULTADO em si (segmentos com timestamp,
 * falante, texto) precisa ser linha de banco - as fases futuras de busca/semantica
 * (`11_ROADMAP_BACKLOG.md` Fase 7) vao consultar `transcript_segments` diretamente, nao um arquivo.
 * `transcription_jobs` rastreia SO o processo (status/progresso/erro); `transcripts`/
 * `transcript_segments` sao criados pelo `TranscriptionService` UNICAMENTE quando o job termina
 * `COMPLETED` - nenhuma linha "vazia"/parcial aparece enquanto o job ainda esta em voo.
 */
export const transcriptionJobs = sqliteTable(
  'transcription_jobs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('QUEUED'),
    progress: integer('progress').notNull().default(0),
    provider: text('provider').notNull(),
    language: text('language'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at')
  },
  (table) => [index('idx_transcription_jobs_project').on(table.projectId, table.status)]
)

/** `06_DATA_MODEL.md` "Transcript" - so existe apos um `transcription_jobs` terminar `COMPLETED`.
 * `editedText`: refinamento pos-MVP (pedido real do usuario - "abrir a transcricao numa caixa de
 * texto editavel"). `NULL` ate a primeira edicao manual - a UI usa o texto ORIGINAL (juncao dos
 * `transcript_segments`, imutaveis) enquanto isso. Guardado como um campo separado, de proposito,
 * em vez de reescrever `transcript_segments.text` - os segmentos continuam intactos com seus
 * timestamps/falante/confianca (usados pelo deep-link de busca e pelo indice FTS5), e uma edicao
 * manual livre (o usuario pode reescrever o texto inteiro, juntar/quebrar frases como quiser) nao
 * teria como ser remapeada de volta pra segmentos individuais sem perder informacao. */
export const transcripts = sqliteTable(
  'transcripts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    language: text('language'),
    createdAt: text('created_at').notNull(),
    editedText: text('edited_text')
  },
  (table) => [index('idx_transcripts_project').on(table.projectId)]
)

/** `06_DATA_MODEL.md` "TranscriptSegment" - `confidence` e `real` (0..1), nao `integer`, unica
 * tabela deste app com um campo de ponto flutuante genuino (as demais "porcentagens" sao sempre
 * inteiras por design, ver `CameraTransformSchema`). */
export const transcriptSegments = sqliteTable(
  'transcript_segments',
  {
    id: text('id').primaryKey(),
    transcriptId: text('transcript_id')
      .notNull()
      .references(() => transcripts.id, { onDelete: 'cascade' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    speaker: text('speaker'),
    text: text('text').notNull(),
    confidence: real('confidence')
  },
  (table) => [index('idx_transcript_segments_transcript_start').on(table.transcriptId, table.startMs)]
)
