import { z } from 'zod'

export const IdSchema = z.string().uuid()

/** String ISO-8601. Validacao de formato estrito e deliberadamente leve nesta fase. */
export const IsoDateTimeSchema = z.string().min(1)

/** Payload vazio - usado por canais que nao recebem argumentos (ex.: `project.list`). */
export const EmptyRequestSchema = z.undefined()
