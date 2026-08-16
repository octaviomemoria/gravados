import { eq, asc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { markers } from '../schema'
import type { MarkerEntity } from '../../../shared/types/entities'

export class MarkerRepository {
  constructor(private readonly db: AppDatabase) {}

  create(marker: MarkerEntity): MarkerEntity {
    this.db.insert(markers).values(marker).run()
    return marker
  }

  listByProject(projectId: string): MarkerEntity[] {
    return this.db
      .select()
      .from(markers)
      .where(eq(markers.projectId, projectId))
      .orderBy(asc(markers.timestampMs))
      .all()
  }

  findById(id: string): MarkerEntity | undefined {
    return this.db.select().from(markers).where(eq(markers.id, id)).get()
  }

  /** Refinamento pós-LIB-PLAYER. `patch` só toca os campos presentes (`title`/`note`), cada um
   * podendo ser `null` explícito (limpar) - o CHAMADOR (`MarkerService`, se um dia existir; hoje
   * direto no handler) decide o que faz parte do patch antes de chegar aqui. Um patch VAZIO é um
   * no-op explícito (`drizzle-orm`'s `.set({})` lança `Error: No values to set` - achado real ao
   * testar este caminho, não uma suposição) - nunca chega a tocar o banco.
   */
  update(id: string, patch: Partial<Pick<MarkerEntity, 'title' | 'note'>>): void {
    if (Object.keys(patch).length === 0) return
    this.db.update(markers).set(patch).where(eq(markers.id, id)).run()
  }

  delete(id: string): void {
    this.db.delete(markers).where(eq(markers.id, id)).run()
  }
}
