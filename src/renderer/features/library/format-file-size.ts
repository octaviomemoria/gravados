/**
 * LIB-002 (decimo primeiro incremento - detalhes do projeto). Diferente de `formatGb` (usada pelo
 * monitor de espaço em disco, onde o valor é sempre grande o suficiente para GB fazer sentido), o
 * tamanho de UM projeto pode ser de poucos KB (gravação de teste curta) a vários GB - escolhe a
 * unidade automaticamente para nunca mostrar "0.0 GB" para um arquivo pequeno.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}
