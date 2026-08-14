import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.schema'

/**
 * 06_DATA_MODEL.md - entidade EditProject. Nenhum canal IPC expoe esta tabela ainda (sem UI de
 * editor nesta fase) - existe apenas para persistencia/tipagem, conforme 05_MEDIA_EDITOR.md.
 */
export const editProjects = sqliteTable(
  'edit_projects',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
    /**
     * EDIT-007 (decimo oitavo incremento - undo/redo). Quantas das operacoes de `edit_operations`
     * (ordenadas por `sequence`, NUNCA fisicamente apagadas por um undo) estao "ativas" na
     * timeline editada atual - `getEditedTimeline` so reproduz operacoes com
     * `sequence <= activeOperationSequence`. Undo decrementa, redo incrementa (ate o total de
     * operacoes persistidas); uma operacao NOVA criada com o cursor no meio do historico (ou
     * seja, depois de um undo) apaga fisicamente as operacoes "no futuro" antes de inserir -
     * mesmo comportamento padrao de undo/redo de qualquer editor (uma acao nova invalida o
     * "refazer" pendente).
     */
    activeOperationSequence: integer('active_operation_sequence').notNull().default(0)
  },
  (table) => [index('idx_edit_projects_project_id').on(table.projectId)]
)
