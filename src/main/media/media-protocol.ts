import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat as statAsync } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ProjectRepository } from '../database/repositories/project.repository'
import { assertPathWithinBoundary } from './project-filesystem'
import { guessMediaContentType, parseRangeHeader, isValidMediaRelativePath } from './media-protocol-utils'
import { MEETING_MEDIA_SCHEME } from '../../shared/constants/media-protocol'
import { createScopedLogger } from '../services/logger'

const logger = createScopedLogger('media-protocol')

/**
 * EDIT-003 (decimo quarto incremento - Fase 3, preview). Serve os segmentos gravados
 * (`.webm`, reais no disco) ao renderer sob um esquema customizado - a unica forma de um
 * `<video>`/`<audio>` conseguir tocar midia local em Electron sem desativar `webSecurity` nem
 * expor Node.js ao renderer (ambos proibidos por este projeto, ver `secure-webpreferences.ts`).
 *
 * `registerMeetingMediaSchemeAsPrivileged` PRECISA rodar antes de `app.whenReady()` (exigencia do
 * Electron para marcar o esquema como `standard`/`secure`/com suporte a Fetch e streaming) -
 * chamada no topo do modulo em `main/index.ts`, fora de qualquer funcao. O handler de fato
 * (`registerMeetingMediaProtocolHandler`) so pode ser registrado DEPOIS, com o `ProjectRepository`
 * real ja disponivel (dentro de `bootstrap()`, apos `createAppContext`).
 */
export function registerMeetingMediaSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEETING_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: false
      }
    }
  ])
}

export function registerMeetingMediaProtocolHandler(projectRepository: ProjectRepository): void {
  protocol.handle(MEETING_MEDIA_SCHEME, async (request) => {
    try {
      return await handleMediaRequest(request, projectRepository)
    } catch (error) {
      logger.error('Falha inesperada ao servir midia local', {
        operation: 'media-protocol.handle',
        errorCode: error instanceof Error ? error.name : 'UNKNOWN'
      })
      return new Response(null, { status: 500 })
    }
  })
}

async function handleMediaRequest(
  request: Request,
  projectRepository: ProjectRepository
): Promise<Response> {
  const url = new URL(request.url)
  const projectId = url.hostname
  const relativePath = url.pathname
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
    .join('/')

  // Filtro de formato em defesa profunda - so aceita o padrao exato que o proprio app produz,
  // antes mesmo de tocar o banco/disco (ver comentario em `media-protocol-utils.ts`).
  if (!isValidMediaRelativePath(relativePath)) {
    return new Response(null, { status: 403 })
  }

  const project = projectRepository.findById(projectId)
  if (!project) {
    return new Response(null, { status: 404 })
  }

  const absolutePath = join(project.rootPath, ...relativePath.split('/'))
  try {
    assertPathWithinBoundary(absolutePath, project.rootPath)
  } catch {
    return new Response(null, { status: 403 })
  }

  let fileSize: number
  try {
    fileSize = (await statAsync(absolutePath)).size
  } catch {
    return new Response(null, { status: 404 })
  }

  const contentType = guessMediaContentType(relativePath)
  const range = parseRangeHeader(request.headers.get('range'), fileSize)

  if (range) {
    const stream = createReadStream(absolutePath, { start: range.start, end: range.end })
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
        'Accept-Ranges': 'bytes'
      }
    })
  }

  const stream = createReadStream(absolutePath)
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes'
    }
  })
}
