// Applies the Drizzle migrations to NUXT_DATABASE_URL and makes sure the Inbox project exists.
// Usage: pnpm db:migrate

import { databaseConfigFromEnv, describeDatabaseUrl, loadProjectEnv } from './lib/env'
import { migrateDatabase } from './lib/migrate'

async function main(): Promise<void> {
  loadProjectEnv()
  const config = databaseConfigFromEnv()
  console.log(`Database: ${describeDatabaseUrl(config.url)}`)
  const { applied, inbox } = await migrateDatabase(config)
  console.log(`Migrations: up to date (${applied} applied)`)
  console.log(`Inbox: ${inbox.name} (${inbox.key}, /${inbox.slug})`)
}

main().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
