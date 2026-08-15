import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, stat, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from '../../fixtures/tmp-db'
import {
  ProjectRepository,
  EditProjectRepository,
  TrackRepository,
  SegmentRepository,
  EditOperationRepository,
  ExportJobRepository
} from '../../../src/main/database/repositories'
import { EditorService } from '../../../src/main/services/editor.service'
import { ExportService } from '../../../src/main/services/export.service'
import { JobRunner } from '../../../src/main/jobs/job-runner'
import { ExportJobStore } from '../../../src/main/jobs/export-job-store'
import { initializeProjectOnDisk } from '../../../src/main/media/project-filesystem'
import { runFfmpegProcess, runFfprobeProcess } from '../../../src/main/media/ffmpeg/ffmpeg-runner'
import { resolveFfmpegBinaries } from '../../../src/main/media/ffmpeg/ffmpeg-locator'
import { NotFoundError, ValidationError } from '../../../src/shared/types/domain-errors'
import type { DatabaseClient } from '../../../src/main/database/client'
import type { ProjectEntity, TrackType } from '../../../src/shared/types/entities'

/**
 * EXP-003/004 (vigesimo quinto incremento - Fase 4). Duas camadas de teste:
 * - `describe('startExport - validacao')`: repositorios reais, mas SEM spawnar FFmpeg de proposito
 *   pra cada caso (cobre os caminhos que rejeitam ANTES de enfileirar - projeto ausente, timeline
 *   vazia, timeline sem trilha de audio pra um target AUDIO, `rangeMs` alem da duracao real).
 * - `describe('startExport - render real (integracao)')`: gera um clipe SINTETICO de verdade via
 *   o proprio binario `ffmpeg-static` (lavfi `testsrc`/`sine`, sem depender de nenhum arquivo de
 *   midia externo) e roda o pipeline COMPLETO ate um MP4 real em disco - a unica forma de provar
 *   que `buildFfmpegArgs` gera sintaxe FFmpeg genuinamente valida, nao so estruturalmente
 *   plausivel (arriscado o bastante numa grafo de filtros escrito a mao para merecer essa
 *   verificacao, alem dos testes estruturais em `ffmpeg-command.test.ts`).
 */
describe('ExportService', () => {
  let client: DatabaseClient
  let projectRepository: ProjectRepository
  let editProjectRepository: EditProjectRepository
  let trackRepository: TrackRepository
  let segmentRepository: SegmentRepository
  let exportJobRepository: ExportJobRepository
  let editorService: EditorService
  let exportService: ExportService
  let libraryRoot: string

  beforeEach(async () => {
    client = createTestDatabase()
    libraryRoot = await mkdtemp(join(tmpdir(), 'meeting-studio-export-test-'))
    projectRepository = new ProjectRepository(client.db)
    editProjectRepository = new EditProjectRepository(client.db)
    trackRepository = new TrackRepository(client.db)
    segmentRepository = new SegmentRepository(client.db)
    const editOperationRepository = new EditOperationRepository(client.db)
    exportJobRepository = new ExportJobRepository(client.db)
    editorService = new EditorService(
      editProjectRepository,
      projectRepository,
      trackRepository,
      segmentRepository,
      editOperationRepository,
      client.db
    )
    const exportJobRunner = new JobRunner(new ExportJobStore(exportJobRepository))
    exportService = new ExportService(
      editProjectRepository,
      projectRepository,
      editorService,
      exportJobRunner,
      exportJobRepository
    )
  })

  afterEach(async () => {
    client.close()
    await rm(libraryRoot, { recursive: true, force: true })
  })

  function createProject(rootPath: string, status: ProjectEntity['status'] = 'COMPLETED'): { id: string } {
    const id = randomUUID()
    projectRepository.create({
      id,
      title: 'Reuniao gravada',
      createdAt: new Date().toISOString(),
      status,
      rootPath
    })
    return { id }
  }

  function addTrackWithSegment(projectId: string, type: TrackType, relativePath: string): string {
    const trackId = randomUUID()
    trackRepository.create({
      id: trackId,
      projectId,
      type,
      enabled: true,
      position: 0,
      startOffsetMs: 0
    })
    segmentRepository.create({
      id: randomUUID(),
      trackId,
      seqIndex: 1,
      relativePath,
      startedAtMs: 0,
      endedAtMs: 2000,
      durationMs: 2000,
      byteSize: 1000,
      mimeType: type === 'MICROPHONE' ? 'audio/webm' : 'video/webm',
      finalized: true
    })
    return trackId
  }

  describe('startExport - validacao', () => {
    it('throws NotFoundError for an unknown edit project', () => {
      expect(() =>
        exportService.startExport('missing-edit-project', { kind: 'VIDEO', resolution: 'HD_720P' })
      ).toThrow(NotFoundError)
    })

    it('throws ValidationError when the edited timeline is empty (no tracks)', () => {
      const project = createProject(join(libraryRoot, 'p1'))
      const editProject = editorService.createEditProject(project.id)
      expect(() =>
        exportService.startExport(editProject.id, { kind: 'VIDEO', resolution: 'HD_720P' })
      ).toThrow(ValidationError)
    })

    it(
      'does NOT reject a PiP layout anymore (EXP-004b) - enqueues normally like any other layout',
      async () => {
        const project = createProject(join(libraryRoot, 'p2'))
        addTrackWithSegment(project.id, 'SCREEN', 'source/screen/screen_000001.webm')
        addTrackWithSegment(project.id, 'CAMERA', 'source/camera/camera_000001.webm')
        const editProject = editorService.createEditProject(project.id)
        // DEFAULT_LAYOUT_PRESET e 'PIP' - com tela+camera presentes, computePreviewLayout resolve
        // pra 'pip'; `buildFfmpegArgs` agora compoe um overlay de verdade (EXP-004b), entao isto
        // nao lanca `ValidationError` mais - o que este teste prova. Espera o job terminar
        // (referencia arquivos que nao existem de verdade neste describe, entao o proprio FFmpeg
        // real falha rapido - `FAILED`, nao `COMPLETED`) so pra nao deixar um spawn em segundo
        // plano pendente apos o teste acabar (o `afterEach` fecha o banco logo em seguida). A
        // exportacao REAL de um PiP, com media sintetica de verdade, e testada na secao de
        // integracao abaixo.
        const job = exportService.startExport(editProject.id, { kind: 'VIDEO', resolution: 'HD_720P' })
        expect(['QUEUED', 'RUNNING']).toContain(job.status)

        const deadline = Date.now() + 10_000
        let finalJob = exportJobRepository.findById(job.id)!
        while (Date.now() < deadline && (finalJob.status === 'QUEUED' || finalJob.status === 'RUNNING')) {
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
          finalJob = exportJobRepository.findById(job.id)!
        }
        expect(finalJob.status).toBe('FAILED')
      },
      15_000
    )

    it('throws ValidationError for an AUDIO target when no audio-capable track exists (EXP-005)', () => {
      const project = createProject(join(libraryRoot, 'p3'))
      addTrackWithSegment(project.id, 'SCREEN', 'source/screen/screen_000001.webm')
      const editProject = editorService.createEditProject(project.id)
      // So SCREEN (video-only por design, ver render-plan.ts) - buildRenderPlan.audio fica vazio.
      expect(() =>
        exportService.startExport(editProject.id, { kind: 'AUDIO', format: 'WAV' })
      ).toThrow(ValidationError)
    })

    it('throws ValidationError when rangeMs.endMs exceeds the timeline totalDurationMs (EXP-006)', () => {
      const project = createProject(join(libraryRoot, 'p4'))
      addTrackWithSegment(project.id, 'MICROPHONE', 'source/microphone/microphone_000001.webm')
      const editProject = editorService.createEditProject(project.id)
      // `addTrackWithSegment` cria um clip de 0-2000ms (ver `startedAtMs`/`endedAtMs` no helper).
      const timeline = editorService.getEditedTimeline(editProject.id)
      expect(() =>
        exportService.startExport(
          editProject.id,
          { kind: 'AUDIO', format: 'WAV' },
          { startMs: 0, endMs: timeline.totalDurationMs + 1000 }
        )
      ).toThrow(ValidationError)
    })
  })

  describe('startExport - render real (integracao)', () => {
    /**
     * Gera DOIS clipes sinteticos de verdade via o mesmo binario FFmpeg real que o app usa -
     * nenhum arquivo de midia externo, nenhum mock de spawn. Deliberadamente VIDEO-ONLY (tela) +
     * AUDIO-ONLY (microfone), replicando a forma real dos arquivos que este app produz
     * (`RecordingSetupPage.tsx`/`useRecordingSession.ts` pedem SCREEN sempre com `audio: false` -
     * CAMERA idem) - um clipe SCREEN com audio embutido (como um teste anterior gerava, por
     * engano) mascarava exatamente o bug real corrigido em `buildRenderPlan` (uma trilha SCREEN/
     * CAMERA nao-mutada virando uma camada de audio inexistente no arquivo real). Reusado pelos
     * testes de export de VIDEO (EXP-003/004) e AUDIO (EXP-005) - a mesma gravacao sintetica serve
     * pros dois, so o `target` passado a `startExport` muda.
     */
    async function setupScreenAndMicProject(): Promise<{
      editProjectId: string
      paths: Awaited<ReturnType<typeof initializeProjectOnDisk>>['paths']
    }> {
      const { ffmpegPath } = resolveFfmpegBinaries()
      expect(ffmpegPath).toBeTruthy()

      const projectId = randomUUID()
      const { paths } = await initializeProjectOnDisk(libraryRoot, projectId)

      const screenClipPath = join(paths.sourceScreenPath, 'screen_000001.webm')
      const generateScreen = runFfmpegProcess({
        binaryPath: ffmpegPath!,
        args: [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=320x240:duration=2:rate=10',
          '-an',
          '-c:v',
          'libvpx',
          '-b:v',
          '300k',
          screenClipPath
        ]
      })
      expect((await generateScreen.result).exitCode).toBe(0)

      const micClipPath = join(paths.sourceMicrophonePath, 'microphone_000001.webm')
      const generateMic = runFfmpegProcess({
        binaryPath: ffmpegPath!,
        args: [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=2',
          '-vn',
          '-c:a',
          'libopus',
          micClipPath
        ]
      })
      expect((await generateMic.result).exitCode).toBe(0)

      projectRepository.create({
        id: projectId,
        title: 'Reuniao sintetica',
        createdAt: new Date().toISOString(),
        status: 'COMPLETED',
        rootPath: paths.rootPath
      })
      const screenTrackId = randomUUID()
      trackRepository.create({
        id: screenTrackId,
        projectId,
        type: 'SCREEN',
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId: screenTrackId,
        seqIndex: 1,
        relativePath: 'source/screen/screen_000001.webm',
        startedAtMs: 0,
        endedAtMs: 2000,
        durationMs: 2000,
        byteSize: (await stat(screenClipPath)).size,
        mimeType: 'video/webm',
        finalized: true
      })
      const micTrackId = randomUUID()
      trackRepository.create({
        id: micTrackId,
        projectId,
        type: 'MICROPHONE',
        enabled: true,
        position: 1,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId: micTrackId,
        seqIndex: 1,
        relativePath: 'source/microphone/microphone_000001.webm',
        startedAtMs: 0,
        endedAtMs: 2000,
        durationMs: 2000,
        byteSize: (await stat(micClipPath)).size,
        mimeType: 'audio/webm',
        finalized: true
      })

      const editProject = editorService.createEditProject(projectId)
      return { editProjectId: editProject.id, paths }
    }

    /**
     * EXP-004b - gera DOIS clipes de video sinteticos (tela + camera, ambos video-only via `-an`,
     * mesma forma real de captura ja usada por `setupScreenAndMicProject`) e cria um projeto de
     * edicao com layout PIP (`DEFAULT_LAYOUT_PRESET`) por padrao - `computePreviewLayout` resolve
     * pra `pip` automaticamente com tela+camera presentes, sem precisar chamar
     * `setLayoutPreset` explicitamente. Reusado pelo teste de PiP (layout padrao) e pelo de
     * lado-a-lado (que chama `setLayoutPreset(..., 'SIDE_BY_SIDE')` em cima do mesmo par de
     * trilhas).
     */
    async function setupScreenAndCameraProject(): Promise<{ editProjectId: string }> {
      const { ffmpegPath } = resolveFfmpegBinaries()
      expect(ffmpegPath).toBeTruthy()

      const projectId = randomUUID()
      const { paths } = await initializeProjectOnDisk(libraryRoot, projectId)

      const screenClipPath = join(paths.sourceScreenPath, 'screen_000001.webm')
      const generateScreen = runFfmpegProcess({
        binaryPath: ffmpegPath!,
        args: [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=320x240:duration=2:rate=10',
          '-an',
          '-c:v',
          'libvpx',
          '-b:v',
          '300k',
          screenClipPath
        ]
      })
      expect((await generateScreen.result).exitCode).toBe(0)

      const cameraClipPath = join(paths.sourceCameraPath, 'camera_000001.webm')
      const generateCamera = runFfmpegProcess({
        binaryPath: ffmpegPath!,
        args: [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=320x240:duration=2:rate=10',
          '-an',
          '-c:v',
          'libvpx',
          '-b:v',
          '300k',
          cameraClipPath
        ]
      })
      expect((await generateCamera.result).exitCode).toBe(0)

      projectRepository.create({
        id: projectId,
        title: 'Reuniao sintetica tela+camera',
        createdAt: new Date().toISOString(),
        status: 'COMPLETED',
        rootPath: paths.rootPath
      })
      const screenTrackId = randomUUID()
      trackRepository.create({
        id: screenTrackId,
        projectId,
        type: 'SCREEN',
        enabled: true,
        position: 0,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId: screenTrackId,
        seqIndex: 1,
        relativePath: 'source/screen/screen_000001.webm',
        startedAtMs: 0,
        endedAtMs: 2000,
        durationMs: 2000,
        byteSize: (await stat(screenClipPath)).size,
        mimeType: 'video/webm',
        finalized: true
      })
      const cameraTrackId = randomUUID()
      trackRepository.create({
        id: cameraTrackId,
        projectId,
        type: 'CAMERA',
        enabled: true,
        position: 1,
        startOffsetMs: 0
      })
      segmentRepository.create({
        id: randomUUID(),
        trackId: cameraTrackId,
        seqIndex: 1,
        relativePath: 'source/camera/camera_000001.webm',
        startedAtMs: 0,
        endedAtMs: 2000,
        durationMs: 2000,
        byteSize: (await stat(cameraClipPath)).size,
        mimeType: 'video/webm',
        finalized: true
      })

      const editProject = editorService.createEditProject(projectId)
      return { editProjectId: editProject.id }
    }

    /** `startExport` e fire-and-forget de proposito (ver comentario no proprio servico) - faz
     * poll na tabela `export_jobs` ate um estado terminal, mesmo espirito ja usado pelos testes
     * E2E deste projeto pra esperar por arquivos de segmento no disco. */
    async function waitForTerminalJob(jobId: string) {
      const deadline = Date.now() + 30_000
      let job = exportJobRepository.findById(jobId)!
      while (Date.now() < deadline && (job.status === 'QUEUED' || job.status === 'RUNNING')) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
        job = exportJobRepository.findById(jobId)!
      }
      return job
    }

    /** EXP-004b - confirma via ffprobe REAL que o arquivo de saida tem exatamente a resolucao de
     * saida esperada (`WxH`) - a prova mais direta de que o video COMPOSITO (overlay/hstack) foi
     * de fato gerado no tamanho certo, nao so "um MP4 nao-vazio qualquer" (o mesmo grau de
     * verificacao ja usado pra provar `rangeMs` via tamanho de arquivo WAV, EXP-006). */
    async function probeVideoDimensions(outputPath: string): Promise<{ width: number; height: number }> {
      const { ffprobePath } = resolveFfmpegBinaries()
      const result = await runFfprobeProcess(ffprobePath!, [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        outputPath
      ])
      const parsed = JSON.parse(result.stdout) as { streams: [{ width: number; height: number }] }
      return { width: parsed.streams[0].width, height: parsed.streams[0].height }
    }

    it(
      'EXP-004b: composes a real PiP export (screen background + camera overlay) at the requested resolution',
      async () => {
        const { editProjectId } = await setupScreenAndCameraProject()
        // DEFAULT_LAYOUT_PRESET e 'PIP' - nao precisa chamar setLayoutPreset explicitamente.
        const job = exportService.startExport(editProjectId, { kind: 'VIDEO', resolution: 'HD_720P' })
        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('COMPLETED')
        expect(finalJob.outputPath).toBeTruthy()
        expect((await stat(finalJob.outputPath!)).size).toBeGreaterThan(0)

        // A saida final tem exatamente 1280x720 (HD_720P) - so alcancavel se o `overlay` real foi
        // composto sobre o fundo escalado/preenchido corretamente (um filter_complex malformado
        // faria o FFmpeg rejeitar o comando inteiro, nunca produzir um arquivo com o tamanho errado).
        expect(await probeVideoDimensions(finalJob.outputPath!)).toEqual({ width: 1280, height: 720 })
      },
      40_000
    )

    it(
      'EXP-004b: composes a real side-by-side export (screen left + camera right) at the requested resolution',
      async () => {
        const { editProjectId } = await setupScreenAndCameraProject()
        editorService.setLayoutPreset(editProjectId, 'SIDE_BY_SIDE')
        const job = exportService.startExport(editProjectId, { kind: 'VIDEO', resolution: 'HD_720P' })
        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('COMPLETED')
        expect(finalJob.outputPath).toBeTruthy()
        expect((await stat(finalJob.outputPath!)).size).toBeGreaterThan(0)

        // Mesma prova de dimensoes - so alcancavel se o `hstack` real combinou as duas metades
        // (640x720 cada) de volta pro quadro inteiro de 1280x720.
        expect(await probeVideoDimensions(finalJob.outputPath!)).toEqual({ width: 1280, height: 720 })
      },
      40_000
    )

    it(
      'produces a real, non-empty MP4 file and marks the job COMPLETED',
      async () => {
        const { editProjectId, paths } = await setupScreenAndMicProject()
        const job = exportService.startExport(editProjectId, { kind: 'VIDEO', resolution: 'HD_720P' })
        // `JobRunner.run` e uma funcao `async` cujo corpo roda SINCRONAMENTE ate o primeiro
        // `await` real (dentro de `runFfmpegProcess`, depois do `spawn` ja ter acontecido) - e
        // deterministico que o status JA tenha virado `RUNNING` no instante em que `startExport`
        // retorna. `QUEUED` so aparece aqui defensivamente, caso os detalhes de agendamento do
        // `JobRunner` mudem no futuro.
        expect(['QUEUED', 'RUNNING']).toContain(job.status)

        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('COMPLETED')
        expect(finalJob.outputPath).toBeTruthy()
        const outputStat = await stat(finalJob.outputPath!)
        expect(outputStat.size).toBeGreaterThan(0)
        expect(finalJob.outputPath!.startsWith(paths.exportsPath)).toBe(true)
        expect(finalJob.outputPath).toMatch(/\.mp4$/)
      },
      40_000
    )

    it(
      'EXP-005: produces a real, non-empty WAV file from the microphone track and marks the job COMPLETED',
      async () => {
        const { editProjectId, paths } = await setupScreenAndMicProject()
        // Mesma gravacao (tela video-only + microfone audio-only) - so o SCREEN nao entra no
        // arquivo de audio (nunca teve stream de audio pra comecar), so o microfone.
        const job = exportService.startExport(editProjectId, { kind: 'AUDIO', format: 'WAV' })
        expect(['QUEUED', 'RUNNING']).toContain(job.status)

        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('COMPLETED')
        expect(finalJob.outputPath).toBeTruthy()
        const outputStat = await stat(finalJob.outputPath!)
        expect(outputStat.size).toBeGreaterThan(0)
        expect(finalJob.outputPath!.startsWith(paths.exportsPath)).toBe(true)
        expect(finalJob.outputPath).toMatch(/\.wav$/)
      },
      40_000
    )

    it(
      'EXP-006: rangeMs trims the export to only the selected portion (WAV byte size scales with duration)',
      async () => {
        const { editProjectId } = await setupScreenAndMicProject()
        // WAV e PCM sem compressao - o tamanho do arquivo e proporcional a DURACAO real
        // codificada, a forma mais direta de provar (sem precisar de ffprobe) que `rangeMs`
        // realmente recorta o audio exportado, nao so aceita o parametro sem aplicar.
        const fullJob = exportService.startExport(editProjectId, { kind: 'AUDIO', format: 'WAV' })
        const fullFinal = await waitForTerminalJob(fullJob.id)
        expect(fullFinal.status).toBe('COMPLETED')
        const fullSize = (await stat(fullFinal.outputPath!)).size

        // Clipe sintetico tem 2000ms - exporta so o primeiro quarto (0-500ms).
        const rangeJob = exportService.startExport(
          editProjectId,
          { kind: 'AUDIO', format: 'WAV' },
          { startMs: 0, endMs: 500 }
        )
        const rangeFinal = await waitForTerminalJob(rangeJob.id)
        expect(rangeFinal.status).toBe('COMPLETED')
        const rangeSize = (await stat(rangeFinal.outputPath!)).size

        expect(rangeSize).toBeGreaterThan(0)
        // Bem menor, nao so "um pouco menor" - deixa folga generosa pro cabecalho WAV fixo (44
        // bytes) nao dominar a comparacao numa faixa tao curta.
        expect(rangeSize).toBeLessThan(fullSize * 0.6)
      },
      60_000
    )

    /**
     * EXP-008 (RF-035 "possibilidade de cancelar") - o UNICO teste desta suite que gera um clipe
     * DELIBERADAMENTE mais longo/pesado (6s, libx264 "medium" em 1080p) - os outros clipes de 2s
     * terminam rapido demais pra dar uma janela real entre `startExport` e `cancelExport` chegar
     * NO MEIO do encode real. Prova tres coisas de uma vez: (1) o job termina CANCELED, nao
     * COMPLETED nem FAILED (a re-checagem de status em `JobRunner.run` funcionando de ponta a
     * ponta, nao so em isolamento como em `job-runner.test.ts`); (2) o PROCESSO real e morto de
     * verdade, nao so o status do banco mudado - verificado observando que o arquivo de saida para
     * de crescer logo apos o cancelamento (um FFmpeg ainda vivo continuaria escrevendo nele);
     * (3) `activeCancelFns` nao vaza - uma segunda chamada a `cancelExport` no mesmo job (agora
     * terminal) e um no-op seguro, nao lanca.
     */
    it(
      'EXP-008: cancelExport kills the real FFmpeg process mid-flight and leaves the job CANCELED',
      async () => {
        const { ffmpegPath } = resolveFfmpegBinaries()
        expect(ffmpegPath).toBeTruthy()

        const projectId = randomUUID()
        const { paths } = await initializeProjectOnDisk(libraryRoot, projectId)
        const screenClipPath = join(paths.sourceScreenPath, 'screen_000001.webm')
        const generateScreen = runFfmpegProcess({
          binaryPath: ffmpegPath!,
          args: [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'testsrc=size=1280x720:duration=6:rate=30',
            '-an',
            '-c:v',
            'libvpx',
            '-b:v',
            '1500k',
            screenClipPath
          ]
        })
        expect((await generateScreen.result).exitCode).toBe(0)

        projectRepository.create({
          id: projectId,
          title: 'Reuniao sintetica longa',
          createdAt: new Date().toISOString(),
          status: 'COMPLETED',
          rootPath: paths.rootPath
        })
        const screenTrackId = randomUUID()
        trackRepository.create({
          id: screenTrackId,
          projectId,
          type: 'SCREEN',
          enabled: true,
          position: 0,
          startOffsetMs: 0
        })
        segmentRepository.create({
          id: randomUUID(),
          trackId: screenTrackId,
          seqIndex: 1,
          relativePath: 'source/screen/screen_000001.webm',
          startedAtMs: 0,
          endedAtMs: 6000,
          durationMs: 6000,
          byteSize: (await stat(screenClipPath)).size,
          mimeType: 'video/webm',
          finalized: true
        })
        const editProject = editorService.createEditProject(projectId)

        const job = exportService.startExport(editProject.id, {
          kind: 'VIDEO',
          resolution: 'FULL_HD_1080P'
        })
        expect(['QUEUED', 'RUNNING']).toContain(job.status)

        // Da um instante pro processo FFmpeg REAL ja ter sido spawnado e comecado a escrever no
        // arquivo de saida (libx264 "medium" em 1080p nao termina 6s de video em poucos ms) -
        // cancela DE VERDADE no meio do encode, nao antes dele comecar.
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))

        const cancelResult = exportService.cancelExport(job.id)
        expect(cancelResult.status).toBe('CANCELED')

        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('CANCELED')
        expect(finalJob.outputPath).toBeNull()
        expect(finalJob.completedAt).toBeTruthy()

        // Prova que o PROCESSO real morreu (nao so o status do banco): o arquivo de saida
        // parcial (se algum byte chegou a ser escrito) para de crescer pouco depois do kill -
        // um FFmpeg ainda vivo continuaria produzindo bytes por vários segundos (6s de 1080p).
        // O nome do arquivo inclui `Date.now()` (nao reconstruivel a partir de `job.createdAt`,
        // um ISO string) - descobre o arquivo de verdade listando a pasta em vez de recalcular o
        // nome.
        const exportedFiles = await readdir(paths.exportsPath).catch(() => [])
        const sizeAfterCancel =
          exportedFiles.length > 0
            ? (await stat(join(paths.exportsPath, exportedFiles[0]!))).size
            : 0
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
        const sizeAfterWait =
          exportedFiles.length > 0
            ? (await stat(join(paths.exportsPath, exportedFiles[0]!))).size
            : 0
        expect(sizeAfterWait).toBe(sizeAfterCancel)

        // Idempotencia (`activeCancelFns` ja foi limpo no `finally` do handler) - cancelar de novo
        // um job ja terminal e um no-op seguro, nao lanca nem regride o status.
        const secondCancel = exportService.cancelExport(job.id)
        expect(secondCancel.status).toBe('CANCELED')
      },
      40_000
    )

    /**
     * EXP-009 (RenderPlan doc §12, etapa "Validation") - prova que a validacao via ffprobe REALMENTE
     * decide o resultado final do job, nao so existe sem efeito. Reusa o MESMO clipe sintetico
     * valido de sempre (`setupScreenAndMicProject`) - o FFmpeg real termina com `exitCode 0` e
     * escreve um MP4 genuinamente bom - mas aponta `ffprobePath` (via `ffmpegBinaryOverrides`, o
     * unico motivo desse parametro existir no construtor) pra um binario que nao existe de
     * verdade. `runFfprobeProcess` rejeita a promise ao tentar spawnar (`ENOENT`), o handler de
     * `startExport` propaga o erro, e `JobRunner.run()` marca o job `FAILED` - nunca `COMPLETED`,
     * mesmo com um MP4 perfeitamente valido gravado em disco. Confirma que `exitCode 0` do FFmpeg
     * sozinho NAO e mais suficiente pra aceitar uma exportacao como bem-sucedida.
     */
    it(
      'EXP-009: marks the job FAILED (not COMPLETED) when ffprobe validation cannot run, even with a valid FFmpeg exit code',
      async () => {
        const { editProjectId } = await setupScreenAndMicProject()

        const exportJobRunnerForBrokenProbe = new JobRunner(new ExportJobStore(exportJobRepository))
        const exportServiceWithBrokenProbe = new ExportService(
          editProjectRepository,
          projectRepository,
          editorService,
          exportJobRunnerForBrokenProbe,
          exportJobRepository,
          { ffprobePath: join(libraryRoot, 'binario-ffprobe-que-nao-existe.exe') }
        )

        const job = exportServiceWithBrokenProbe.startExport(editProjectId, {
          kind: 'AUDIO',
          format: 'WAV'
        })
        const finalJob = await waitForTerminalJob(job.id)

        expect(finalJob.status).toBe('FAILED')
        expect(finalJob.error).toBeTruthy()
        // `outputPath` nunca e setado num job FAILED (`ExportJobStore.update`/`ExportJobRepository.
        // fail` so gravam `error`/`completedAt`) - mesmo com o WAV real tendo sido escrito em disco
        // com sucesso pelo FFmpeg, o job nunca reporta um caminho utilizavel pro chamador.
        expect(finalJob.outputPath).toBeNull()
      },
      40_000
    )

    /**
     * EXP-009 - complementa o teste acima com a metade "positiva": quando o ffprobe REAL roda com
     * sucesso contra um arquivo genuinamente valido (o mesmo clipe sintetico de sempre), a
     * validacao NUNCA rejeita um export que deveria ter sido aceito - `finalJob.status` continua
     * `COMPLETED`, exatamente como nos testes de VIDEO/AUDIO/rangeMs acima (todos escritos ANTES
     * do EXP-009 existir, e que continuam passando sem alteracao nenhuma - a prova mais direta de
     * que a validacao nao introduziu nenhum falso negativo pro caminho feliz).
     */
    it(
      'EXP-009: a genuinely valid exported file passes real ffprobe validation and completes normally',
      async () => {
        const { editProjectId } = await setupScreenAndMicProject()
        const job = exportService.startExport(editProjectId, { kind: 'AUDIO', format: 'WAV' })
        const finalJob = await waitForTerminalJob(job.id)
        expect(finalJob.status).toBe('COMPLETED')
        expect(finalJob.outputPath).toBeTruthy()
      },
      40_000
    )
  })
})
