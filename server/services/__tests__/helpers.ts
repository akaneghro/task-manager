// Test helpers: a fresh migrated SQLite database per test + ready-made actors/contexts.
// Uses a temp file (not `:memory:`) because libSQL transactions open a new connection.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createDb } from '../../db'
import type { Db } from '../../db'
import { users } from '../../db/schema'
import type { Actor } from '../../../shared/utils/permissions'
import type { MemberRole } from '../../../shared/utils/enums'
import type { ServiceContext } from '../context'

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url))

/** 32 zero bytes, base64. Only for tests. */
export const TEST_VAULT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
export const TEST_SITE_URL = 'http://localhost:3000'

export interface TestDb {
  db: Db
  ownerId: string
  cleanup: () => void
}

export async function createTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), 'tm-test-'))
  const db = createDb({ url: `file:${join(dir, 'test.db').replace(/\\/g, '/')}` })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  const [owner] = await db.insert(users).values({ githubId: 1, githubLogin: 'owner', name: 'Owner', role: 'owner' }).returning()
  if (!owner) throw new Error('failed to seed owner')
  return {
    db,
    ownerId: owner.id,
    cleanup: () => {
      db.$client.close()
      try {
        rmSync(dir, { recursive: true, force: true })
      }
      catch {
        // Windows may keep the file locked for a moment; temp dirs are cleaned by the OS anyway.
      }
    },
  }
}

export async function createMemberUser(db: Db, login: string, githubId: number): Promise<string> {
  const [user] = await db.insert(users).values({ githubId, githubLogin: login, role: 'member' }).returning()
  if (!user) throw new Error('failed to seed member')
  return user.id
}

export function ownerActor(userId: string): Actor {
  return { kind: 'owner', userId, source: `user:${userId}` }
}

export function memberActor(userId: string, memberships: Record<string, MemberRole>): Actor {
  return { kind: 'member', userId, memberships, source: `user:${userId}` }
}

export function mcpActor(userId: string, opts: { allowSecrets?: boolean, defaultProject?: string | null, tokenName?: string } = {}): Actor {
  const tokenName = opts.tokenName ?? 'test-token'
  return {
    kind: 'mcp',
    userId,
    tokenId: 'token-id',
    tokenName,
    allowSecrets: opts.allowSecrets ?? false,
    defaultProject: opts.defaultProject ?? null,
    source: `mcp:${tokenName}`,
  }
}

export function publicActor(projectId: string): Actor {
  return { kind: 'public', projectId, shareLinkId: 'share-id', source: 'public:share-id' }
}

export function makeCtx(db: Db, actor: Actor, overrides: Partial<ServiceContext> = {}): ServiceContext {
  return { db, actor, vaultKey: TEST_VAULT_KEY, siteUrl: TEST_SITE_URL, ...overrides }
}
