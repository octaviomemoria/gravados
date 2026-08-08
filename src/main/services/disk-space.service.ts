import checkDiskSpace from 'check-disk-space'
import { DiskSpaceError } from '../../shared/types/domain-errors'

export interface DiskSpaceInfo {
  freeBytes: number
  totalBytes: number
  path: string
}

export async function getDiskSpace(targetPath: string): Promise<DiskSpaceInfo> {
  const { free, size, diskPath } = await checkDiskSpace(targetPath)
  return { freeBytes: free, totalBytes: size, path: diskPath }
}

/**
 * RF-042: checar espaco livre antes/durante a gravacao, alertar em niveis criticos. Nesta fase
 * apenas a checagem pontual existe (usada pelo canal `system.getDiskSpace`) - o monitoramento
 * continuo durante uma gravacao ativa e Fase 1 (Recording Core).
 */
export async function assertMinimumDiskSpace(
  targetPath: string,
  minimumFreeBytes: number
): Promise<void> {
  const { freeBytes } = await getDiskSpace(targetPath)
  if (freeBytes < minimumFreeBytes) {
    throw new DiskSpaceError(
      `Espaco em disco insuficiente em "${targetPath}": ${freeBytes} bytes livres, minimo exigido ${minimumFreeBytes}.`,
      { targetPath, freeBytes, minimumFreeBytes }
    )
  }
}
