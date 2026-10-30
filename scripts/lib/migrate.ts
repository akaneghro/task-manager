// Applies the Drizzle migrations and makes sure the Inbox exists (shared by `pnpm db:migrate` and `pnpm run setup`).

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createDb } from '../../server/db'
import { ensureInbox } from '../../server/services/projects'
import { closeDb, localDatabasePath } from './env'
import type { DatabaseEnvConfig } from './env'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))

export interface MigrationResult {
  /** Number of migrations recorded in the database. */
  applied: number
  inbox: { name: string, key: string, slug: string }
}

/** Creates the folder of a local database file if needed, migrates it and ensures the Inbox. Idempotent. */
export async function migrateDatabase(config: DatabaseEnvConfig): Promise<MigrationResult> {
  const file = localDatabasePath(config.url)
  if (file) mkdirSync(dirname(file), { recursive: true })

  const db = createDb(config)
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    const rows = await db.all<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`)
    const inbox = await ensureInbox(db)
    return { applied: Number(rows[0]?.n ?? 0), inbox: { name: inbox.name, key: inbox.key, slug: inbox.slug } }
  }
  finally {
    closeDb(db)
  }
}
