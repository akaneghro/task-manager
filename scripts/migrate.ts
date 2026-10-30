// Applies the Drizzle migrations to NUXT_DATABASE_URL and makes sure the Inbox project exists.
// Usage: pnpm db:migrate

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createDb } from '../server/db'
import { ensureInbox } from '../server/services/projects'
import { closeDb, databaseConfigFromEnv, describeDatabaseUrl, loadProjectEnv, localDatabasePath } from './lib/env'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../server/db/migrations', import.meta.url))

async function main(): Promise<void> {
  loadProjectEnv()
  const config = databaseConfigFromEnv()
  const file = localDatabasePath(config.url)
  if (file) mkdirSync(dirname(file), { recursive: true })

  console.log(`Database: ${describeDatabaseUrl(config.url)}`)
  const db = createDb(config)
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    const applied = await db.all<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`)
    console.log(`Migrations: up to date (${Number(applied[0]?.n ?? 0)} applied)`)

    const inbox = await ensureInbox(db)
    console.log(`Inbox: ${inbox.name} (${inbox.key}, /${inbox.slug})`)
  }
  finally {
    closeDb(db)
  }
}

main().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
