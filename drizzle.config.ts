import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// Load local environment variables when the file exists (Node >= 22.18).
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.NUXT_DATABASE_URL || 'file:./data/task-manager.db',
    authToken: process.env.NUXT_DATABASE_AUTH_TOKEN || undefined,
  },
})
