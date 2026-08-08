import { z } from 'zod'
import { EmptyRequestSchema } from './common.schema'

export const GetAppInfoRequestSchema = EmptyRequestSchema
export const GetAppInfoResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string()
})

export const GetDiskSpaceRequestSchema = z.object({ path: z.string().min(1).optional() })
export type GetDiskSpaceRequest = z.infer<typeof GetDiskSpaceRequestSchema>
export const GetDiskSpaceResponseSchema = z.object({
  freeBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  path: z.string()
})
