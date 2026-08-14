/**
 * EDIT-003 (decimo quarto incremento - Fase 3, Editor MVP - preview). Os segmentos gravados vivem
 * em caminhos reais no disco (`Documentos\MeetingStudio\projects\<id>\source\...`), fora de
 * qualquer alcance do `file://` do renderer (bloqueado por desenho - `webSecurity` nunca e
 * desativado, ver `secure-webpreferences.ts`). Um esquema de protocolo customizado
 * (`main/media/media-protocol.ts`) serve esses arquivos ao renderer sob demanda, com suporte a
 * `Range` (necessario para o `<video>`/`<audio>` conseguir buscar/adiantar sem baixar o arquivo
 * inteiro primeiro) - a unica forma seria de servir midia local em Electron sem desativar
 * `webSecurity` nem expor Node.js ao renderer.
 *
 * Definido em `shared/` (nao em `main/`) porque tanto o main (registro do handler) quanto o
 * renderer (montar a URL de um `<video src>`) precisam do mesmo nome de esquema - uma unica fonte
 * evita o nome ficar dessincronizado entre os dois lados.
 */
export const MEETING_MEDIA_SCHEME = 'meeting-media'

/**
 * `meeting-media://<projectId>/<relativePath com "/" - nunca "\">` - o main resolve `projectId`
 * para o `rootPath` real do projeto (nunca um path bruto vindo do renderer, mesmo padrao ja usado
 * por `project.openFolder`/`recovery.repair`) e valida que o resultado final continua dentro dos
 * limites daquele projeto antes de servir qualquer byte.
 */
export function buildMeetingMediaUrl(projectId: string, relativePath: string): string {
  const segments = relativePath.split(/[\\/]+/).filter((segment) => segment.length > 0)
  const encodedPath = segments.map(encodeURIComponent).join('/')
  return `${MEETING_MEDIA_SCHEME}://${projectId}/${encodedPath}`
}
