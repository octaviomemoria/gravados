import checkDiskSpaceImport from 'check-disk-space'
import { DiskSpaceError } from '../../shared/types/domain-errors'

/**
 * Achado empirico (nono incremento, RF-042 - primeira vez que este servico e exercitado de ponta a
 * ponta por um teste automatizado; `system.getDiskSpace` ja existia mas nunca tinha cobertura real).
 * `check-disk-space` e CJS com um default export (`{ default: fn, InvalidPathError, ... }` - ver
 * `node_modules/check-disk-space/dist/check-disk-space.cjs`). O `externalizeDepsPlugin()` do
 * electron-vite mantem este pacote como um `require()` cru no bundle final de `main/`, SEM aplicar
 * o helper de interop CJS/ESM que o TypeScript normalmente geraria - o valor importado vira o
 * MODULO INTEIRO, nao a funcao, e chama-lo diretamente lanca `TypeError: checkDiskSpace is not a
 * function` (só em runtime, no bundle empacotado - nunca reproduzido em `pnpm test`, que roda
 * contra o codigo-fonte via Vitest/Node, nunca contra `out/main/index.js`). Resolve os dois
 * formatos possiveis defensivamente, funcionando independente de como o bundler decidir tratar
 * este import no futuro.
 */
const checkDiskSpace: typeof checkDiskSpaceImport =
  typeof checkDiskSpaceImport === 'function'
    ? checkDiskSpaceImport
    : (checkDiskSpaceImport as unknown as { default: typeof checkDiskSpaceImport }).default

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
