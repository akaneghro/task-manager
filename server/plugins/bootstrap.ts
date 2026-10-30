// Startup checks. Dev: apply migrations and make sure the Inbox exists (requests wait for it).
// All environments: validate the vault key (warning only). Never crashes the server.

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { ensureInbox } from '../services/projects'
import { decodeVaultKey } from '../utils/crypto'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Creates the folder of a local `file:` database so libSQL can create the file. */
function ensureLocalDbFolder(url: string): void {
  if (!url.startsWith('file:')) return
  const path = url.startsWith('file://') ? fileURLToPath(url) : url.slice('file:'.length)
  if (!path || path === ':memory:') return
  mkdirSync(dirname(resolve(process.cwd(), path)), { recursive: true })
}

async function prepareDevDatabase(databaseUrl: string): Promise<void> {
  try {
    ensureLocalDbFolder(databaseUrl)
    await migrate(useDb(), { migrationsFolder: join(process.cwd(), 'server', 'db', 'migrations') })
    await ensureInbox(useDb())
  }
  catch (error) {
    console.error(`[bootstrap] Database setup failed: ${errorMessage(error)}`)
  }
}

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()

  try {
    decodeVaultKey(config.vaultKey)
  }
  catch (error) {
    console.warn(`[bootstrap] WARNING: vault disabled (${errorMessage(error)}). Vault endpoints will answer 422 "Vault key not configured".`)
  }

  if (import.meta.dev) {
    const ready = prepareDevDatabase(config.databaseUrl)
    nitroApp.hooks.hook('request', async () => {
      await ready
    })
  }
})
