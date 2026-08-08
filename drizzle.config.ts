import { defineConfig } from 'drizzle-kit'

// Usado apenas por `pnpm db:generate` / `db:push` (dev) / `db:studio`.
// O app NUNCA chama drizzle-kit em runtime - migrations sao aplicadas via
// `src/main/database/migrate.ts` a partir dos arquivos SQL versionados
// gerados por `db:generate` (ver README, secao "Migrations").
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/database/schema/index.ts',
  out: './src/main/database/migrations',
  dbCredentials: {
    url: './tests/tmp/dev.db'
  },
  verbose: true,
  strict: true
})
