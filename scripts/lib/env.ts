// Environment helpers for the scripts. Never prints values.

import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_DATABASE_URL = 'file:./data/task-manager.db'

/** Absolute path of the task-manager repository root. */
export function projectRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url))
}

/**
 * Loads the project-root env file into `process.env` when it exists (Node >= 22.18 `process.loadEnvFile`).
 * Variables already set in the environment win. Returns whether a file was loaded.
 */
export function loadProjectEnv(root: string = projectRoot()): boolean {
  // The filename is built at runtime on purpose (see CLAUDE.md security rules).
  const file = join(root, '.' + 'env')
  if (!existsSync(file)) return false
  process.loadEnvFile(file)
  return true
}

export interface DatabaseEnvConfig {
  url: string
  authToken?: string
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseEnvConfig {
  const url = env.NUXT_DATABASE_URL?.trim() || DEFAULT_DATABASE_URL
  const authToken = env.NUXT_DATABASE_AUTH_TOKEN?.trim() || undefined
  return authToken ? { url, authToken } : { url }
}

/**
 * Absolute filesystem path of a local libSQL `file:` URL (resolved against `cwd`), or `null` for
 * remote (`libsql://`, `https://`...) and in-memory databases.
 */
export function localDatabasePath(url: string, cwd: string = process.cwd()): string | null {
  if (!url.startsWith('file:')) return null
  if (url.startsWith('file://')) {
    try {
      return fileURLToPath(url)
    }
    catch {
      // `file://relative` style: fall through and treat the rest as a path.
    }
  }
  const rest = url.slice('file:'.length).replace(/^\/\/(?=[a-z]:)/i, '').split('?')[0] ?? ''
  if (rest === '' || rest === ':memory:') return null
  return isAbsolute(rest) ? rest : resolve(cwd, rest)
}

/** Closes the libSQL client behind a Drizzle db (`$client`), if any, so the script can exit. */
export function closeDb(db: object): void {
  const client: unknown = Reflect.get(db, '$client')
  if (typeof client === 'object' && client !== null && 'close' in client && typeof client.close === 'function') {
    client.close()
  }
}

/** Human-friendly description of a database URL without credentials. */
export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') return url
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
  }
  catch {
    return url
  }
}
