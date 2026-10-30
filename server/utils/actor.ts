// Request -> Actor. Cookie sessions (nuxt-auth-utils) for the web UI, share tokens for public links and bearer
// tokens for scripts. The pure helpers at the top are unit-tested; the rest uses Nitro auto-imports.

import type { H3Event } from 'h3'
import type { User } from '#auth-utils'
import type { UserRow } from '../db/schema'
import type { Actor } from '../../shared/utils/permissions'
import type { MemberRole } from '../../shared/utils/enums'
import type { ServiceContext } from '../services/context'
import { getUserById, loadMemberships } from '../services/users'
import { resolveShareToken } from '../services/shareLinks'
import { decodeVaultKey } from './crypto'
import { useDb } from './db'

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers

/** Public profile stored in the sealed session cookie. */
export function sessionUserFromRow(row: Pick<UserRow, 'id' | 'githubLogin' | 'name' | 'avatarUrl' | 'role'>): User {
  return {
    id: row.id,
    login: row.githubLogin,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
  }
}

/** Actor of a signed-in user. The role always comes from the database row, never from the cookie. */
export function actorForUser(row: Pick<UserRow, 'id' | 'role'>, memberships: Readonly<Record<string, MemberRole>> = {}): Actor {
  const source = `user:${row.id}`
  if (row.role === 'owner') return { kind: 'owner', userId: row.id, source }
  return { kind: 'member', userId: row.id, source, memberships: { ...memberships } }
}

/** Actor of a public share link. */
export function actorForShareLink(link: { shareLinkId: string, projectId: string }): Actor {
  return { kind: 'public', projectId: link.projectId, shareLinkId: link.shareLinkId, source: `public:${link.shareLinkId}` }
}

/** Extracts the token of an `Authorization: Bearer <token>` header. */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header.trim())
  return match?.[1] ?? null
}

// ---------------------------------------------------------------------------------------------------------------
// Nitro helpers

function unauthorized(message: string) {
  return createError({
    statusCode: 401,
    statusMessage: 'Unauthorized',
    message,
    data: { code: 'unauthorized', message },
  })
}

const actorCache = new WeakMap<H3Event, Promise<Actor>>()

async function loadSessionActor(event: H3Event): Promise<Actor> {
  const session = await getUserSession(event)
  const userId: unknown = session.user?.id
  if (typeof userId !== 'string' || userId === '') throw unauthorized('Not signed in')

  const db = useDb()
  const row = await getUserById(db, userId)
  if (!row) {
    // The user was removed: drop the stale cookie.
    await clearUserSession(event)
    throw unauthorized('Session expired')
  }
  // Memberships are loaded on every request so revocations apply immediately.
  const memberships = row.role === 'member' ? await loadMemberships(db, row.id) : {}
  return actorForUser(row, memberships)
}

/** Actor of the signed-in user (owner or member). Throws 401 without a valid session. Cached per request. */
export function requireActor(event: H3Event): Promise<Actor> {
  let actor = actorCache.get(event)
  if (!actor) {
    actor = loadSessionActor(event)
    actorCache.set(event, actor)
  }
  return actor
}

/** Actor of a public share link. Throws 404 for unknown, revoked or orphaned tokens. */
export async function publicActorFromToken(event: H3Event, token: string): Promise<Actor> {
  const link = await resolveShareToken(useDb(), token)
  if (!link) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'Share link not found',
      data: { code: 'not_found', message: 'Share link not found' },
    })
  }
  return actorForShareLink(link)
}

const vaultKeyValidity = new Map<string, boolean>()

/** The configured vault key when it is a valid 32-byte base64 key, else undefined (vault ops then answer 422). */
export function usableVaultKey(key: unknown): string | undefined {
  if (typeof key !== 'string' || key === '') return undefined
  let valid = vaultKeyValidity.get(key)
  if (valid === undefined) {
    try {
      decodeVaultKey(key)
      valid = true
    }
    catch {
      valid = false
    }
    vaultKeyValidity.set(key, valid)
  }
  return valid ? key : undefined
}

export function serviceContext(event: H3Event, actor: Actor): ServiceContext {
  const config = useRuntimeConfig(event)
  return {
    db: useDb(),
    actor,
    vaultKey: usableVaultKey(config.vaultKey),
    siteUrl: config.public.siteUrl || getRequestURL(event).origin,
  }
}

/** Bearer token of the request, if any. */
export function bearerToken(event: H3Event): string | null {
  return parseBearerToken(getHeader(event, 'authorization'))
}
