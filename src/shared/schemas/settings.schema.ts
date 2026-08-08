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

export const SETTINGS_CATEGORY_SCHEMAS = {
  app: AppSettingsSchema,
  recordingPresets: RecordingPresetsSettingsSchema,
  exportPresets: ExportPresetsSettingsSchema
} as const

export const SETTINGS_CATEGORIES = Object.keys(SETTINGS_CATEGORY_SCHEMAS) as Array<
  keyof typeof SETTINGS_CATEGORY_SCHEMAS
>

export const SettingsCategorySchema = z.enum(['app', 'recordingPresets', 'exportPresets'])
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
