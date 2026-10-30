import { createDb } from '../db'
import type { Db } from '../db'

let instance: Db | null = null

/** Nitro-side singleton. Services receive the Db through their ServiceContext instead. */
export function useDb(): Db {
  if (!instance) {
    const config = useRuntimeConfig()
    instance = createDb({ url: config.databaseUrl, authToken: config.databaseAuthToken })
  }
  return instance
}
