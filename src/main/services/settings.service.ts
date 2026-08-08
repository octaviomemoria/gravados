import type { SettingsRepository } from '../database/repositories'
import {
  SETTINGS_CATEGORY_SCHEMAS,
  type SettingsCategory,
  type AppSettings,
  type RecordingPresetsSettings,
  type ExportPresetsSettings
} from '../../shared/schemas/settings.schema'
import { ValidationError } from '../../shared/types/domain-errors'

export interface SettingsDefaults {
  app: AppSettings
  recordingPresets: RecordingPresetsSettings
  exportPresets: ExportPresetsSettings
}

/** RF-041: valores iniciais inertes - nao conectados a nenhuma funcionalidade real nesta fase. */
export function buildDefaultSettings(defaultLibraryRootPath: string): SettingsDefaults {
  return {
    app: {
      theme: 'system',
      defaultLibraryRootPath
    },
    recordingPresets: {
      qualityPreset: 'STANDARD',
      timeSegmentationMinutes: 15,
      sizeSegmentationMb: null,
      diskSpaceWarningThresholdMb: 2048,
      diskSpaceCriticalThresholdMb: 512
    },
    exportPresets: {
      defaultContainer: 'MP4',
      defaultResolution: '1080p',
      defaultAudioFormat: 'M4A'
    }
  }
}

/**
 * Decisao registrada: `settings` e persistida como chave-valor generico; esta camada valida cada
 * categoria com o Zod schema correspondente (`shared/schemas/settings.schema.ts`) e cai de volta
 * para o default quando o valor persistido esta ausente ou corrompido, em vez de quebrar o app.
 */
export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly defaults: SettingsDefaults
  ) {}

  get<TCategory extends SettingsCategory>(category: TCategory): SettingsDefaults[TCategory] {
    const stored = this.repository.get(category)
    if (stored === undefined) {
      return this.defaults[category]
    }
    const schema = SETTINGS_CATEGORY_SCHEMAS[category]
    const parsed = schema.safeParse(stored)
    if (!parsed.success) {
      return this.defaults[category]
    }
    return parsed.data as SettingsDefaults[TCategory]
  }

  update<TCategory extends SettingsCategory>(
    category: TCategory,
    value: unknown,
    updatedAt: string
  ): SettingsDefaults[TCategory] {
    const schema = SETTINGS_CATEGORY_SCHEMAS[category]
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      throw new ValidationError(`Configuracao invalida para categoria "${category}".`, {
        issues: parsed.error.issues
      })
    }
    this.repository.set(category, parsed.data, updatedAt)
    return parsed.data as SettingsDefaults[TCategory]
  }
}
