import { eq, asc, and, gt } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { editOperations } from '../schema'
import type { EditOperationEntity } from '../../../shared/types/entities'

export class EditOperationRepository {
  constructor(private readonly db: AppDatabase) {}

  create(operation: EditOperationEntity): EditOperationEntity {
    this.db.insert(editOperations).values(operation).run()
    return operation
  }

  listByEditProject(editProjectId: string): EditOperationEntity[] {
    return this.db
      .select()
      .from(editOperations)
      .where(eq(editOperations.editProjectId, editProjectId))
      .orderBy(asc(editOperations.sequence))
      .all()
  }

  /** EDIT-007 (decimo oitavo incremento - undo/redo). Apaga fisicamente as operacoes "no
   * futuro" (sequence alem do cursor ativo) antes de gravar uma operacao NOVA depois de um undo -
   * o mesmo comportamento padrao de qualquer editor: criar algo novo invalida o "refazer"
   * pendente, entao essas linhas nunca mais seriam alcancaveis por sequence contiguo mesmo se
   * ficassem no banco. */
  deleteAfterSequence(editProjectId: string, sequence: number): void {
    this.db
      .delete(editOperations)
      .where(and(eq(editOperations.editProjectId, editProjectId), gt(editOperations.sequence, sequence)))
      .run()
  }
}
