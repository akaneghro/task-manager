import { createClient } from '@libsql/client'
import type { Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Db = LibSQLDatabase<typeof schema> & { $client: Client }

export interface DbConfig {
  url: string
  authToken?: string
}

/** Creates a Drizzle client over libSQL. Works with `file:`, `:memory:` and `libsql://` (Turso) URLs. */
export function createDb(config: DbConfig): Db {
  const client = createClient({
    url: config.url,
    authToken: config.authToken || undefined,
  })
  return drizzle(client, { schema })
}

export { schema }
