import { z } from 'zod'

/**
 * RF-041 + 06_DATA_MODEL.md secao 3: configuracoes divididas em categorias conceituais.
 * `aiProvider` nao e criada nesta fase (sem provedor de IA configurado ainda).
 * Decisao registrada: `settings` e persistida como chave-valor generico (ver
 * `main/database/schema/settings.schema.ts`); cada categoria valida seu proprio formato aqui.
 */

export const ThemePreferenceSchema = z.enum(['light', 'dark', 'system'])
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>

export const QualityPresetSchema = z.enum(['ECONOMY', 'STANDARD', 'HIGH'])
export type QualityPreset = z.infer<typeof QualityPresetSchema>

export const AppSettingsSchema = z.object({
  theme: ThemePreferenceSchema,
  defaultLibraryRootPath: z.string().min(1)
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const RecordingPresetsSettingsSchema = z.object({
  qualityPreset: QualityPresetSchema,
  timeSegmentationMinutes: z.number().int().positive().nullable(),
  sizeSegmentationMb: z.number().int().positive().nullable(),
  diskSpaceWarningThresholdMb: z.number().int().positive(),
  diskSpaceCriticalThresholdMb: z.number().int().positive()
})
export type RecordingPresetsSettings = z.infer<typeof RecordingPresetsSettingsSchema>

export const ExportPresetsSettingsSchema = z.object({
  defaultContainer: z.enum(['MP4']),
  defaultResolution: z.enum(['720p', '1080p']),
  defaultAudioFormat: z.enum(['M4A', 'WAV'])
})
export type ExportPresetsSettings = z.infer<typeof ExportPresetsSettingsSchema>

/**
 * Refinamento pos-SEARCH-001 (transcricao local via Whisper/ONNX, `WHISPER_LOCAL` em
 * `transcription.schema.ts`). Tres tamanhos de modelo disponiveis - o usuario escolhe o trade-off
 * entre velocidade/tamanho de download e precisao, nenhum padrao "certo" universal (maquinas sem
 * GPU dedicada sofrem mais com `medium`). Baixado sob demanda na primeira transcricao apos a
 * troca (cache em `userData/whisper-models`, nunca no repositorio do projeto) - trocar de modelo
 * aqui NAO redownload nada ate a proxima transcricao de fato rodar.
 */
export const WhisperModelIdSchema = z.enum(['base', 'small', 'medium'])
export type WhisperModelId = z.infer<typeof WhisperModelIdSchema>

export const TranscriptionSettingsSchema = z.object({
  modelId: WhisperModelIdSchema
})
export type TranscriptionSettings = z.infer<typeof TranscriptionSettingsSchema>

export const SETTINGS_CATEGORY_SCHEMAS = {
  app: AppSettingsSchema,
  recordingPresets: RecordingPresetsSettingsSchema,
  exportPresets: ExportPresetsSettingsSchema,
  transcription: TranscriptionSettingsSchema
} as const

export const SETTINGS_CATEGORIES = Object.keys(SETTINGS_CATEGORY_SCHEMAS) as Array<
  keyof typeof SETTINGS_CATEGORY_SCHEMAS
>

export const SettingsCategorySchema = z.enum(['app', 'recordingPresets', 'exportPresets', 'transcription'])
export type SettingsCategory = z.infer<typeof SettingsCategorySchema>

export const GetSettingsRequestSchema = z.object({ category: SettingsCategorySchema })
export type GetSettingsRequest = z.infer<typeof GetSettingsRequestSchema>
/** Narrado por categoria em `settings.service.ts`; no limite IPC o formato exato varia. */
export const GetSettingsResponseSchema = z.record(z.string(), z.unknown())

export const UpdateSettingsRequestSchema = z.object({
  category: SettingsCategorySchema,
  value: z.record(z.string(), z.unknown())
})
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>
export const UpdateSettingsResponseSchema = z.record(z.string(), z.unknown())
