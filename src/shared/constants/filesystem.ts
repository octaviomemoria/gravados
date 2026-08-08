/**
 * Arvore de diretorios exata de 03_TECHNICAL_ARCHITECTURE.md secao 5:
 *
 * MeetingStudio/
 *   projects/
 *     <project-id>/
 *       manifest.json
 *       source/
 *         screen/
 *         camera/
 *         microphone/
 *         system-audio/
 *       proxies/
 *       thumbnails/
 *       exports/
 *       recovery/
 *
 * Nesta fase apenas a arvore de pastas + manifest.json inicial sao criados ao criar um projeto -
 * nenhum arquivo de midia real e escrito (ver `main/media/project-filesystem.ts`).
 */

export const LIBRARY_FOLDER_NAME = 'MeetingStudio'
export const PROJECTS_FOLDER_NAME = 'projects'
export const MANIFEST_FILE_NAME = 'manifest.json'

export const SOURCE_SUBFOLDERS = ['screen', 'camera', 'microphone', 'system-audio'] as const
export type SourceSubfolder = (typeof SOURCE_SUBFOLDERS)[number]

export const PROJECT_TOP_LEVEL_SUBFOLDERS = ['proxies', 'thumbnails', 'exports', 'recovery'] as const

export const SOURCE_ROOT_FOLDER_NAME = 'source'
