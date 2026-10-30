// Personal API tokens for the MCP server. Only the SHA-256 hash is stored; the plain token is returned once.

import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm'
import { apiTokens, users } from '../db/schema'
import type { ApiTokenRow } from '../db/schema'
import type { Db } from '../db'
import { createTokenSchema } from '../../shared/schemas/token'
import type { CreateTokenInput } from '../../shared/schemas/token'
import type { CreatedTokenDto, TokenDto } from '../../shared/types/dto'
import { API_TOKEN_PREFIX, apiTokenPrefix, generateApiToken, sha256Hex } from '../utils/crypto'
import { ServiceError, assertCan, nowOf } from './context'
import type { ServiceContext } from './context'
import { isUniqueViolation, isoOrNull, parseInput } from './projects'

/** `last_used_at` is written at most once per this interval. */
const LAST_USED_THROTTLE_MS = 60_000
const DAY_MS = 86_400_000

export function toTokenDto(row: ApiTokenRow): TokenDto {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    allowSecrets: row.allowSecrets,
    lastUsedAt: isoOrNull(row.lastUsedAt),
    expiresAt: isoOrNull(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
  }
}

function ownUserId(ctx: ServiceContext): string {
  assertCan(ctx, 'token.manage')
  const actor = ctx.actor
  if (actor.kind === 'public') throw new ServiceError('forbidden', 'Not allowed: token.manage')
  return actor.userId
}

function revokedName(row: Pick<ApiTokenRow, 'id' | 'name'>): string {
  return `${row.name} (revoked ${row.id})`
}

/** The current user's tokens that are not revoked (expired ones included, so they can be revoked), newest first. */
export async function listTokens(ctx: ServiceContext): Promise<TokenDto[]> {
  const userId = ownUserId(ctx)
  const rows = await ctx.db.select().from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt))
  return rows.map(toTokenDto)
}

export async function createToken(ctx: ServiceContext, input: CreateTokenInput): Promise<CreatedTokenDto> {
  const userId = ownUserId(ctx)
  const data = parseInput(createTokenSchema, input)
  const name = data.name

  const [active] = await ctx.db.select({ id: apiTokens.id }).from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt), sql`lower(${apiTokens.name}) = ${name.toLowerCase()}`))
    .limit(1)
  if (active) throw new ServiceError('conflict', `A token named "${name}" already exists`)

  // Revoked rows normally get renamed on revocation; rename any legacy one so the unique (user, name) index
  // never blocks a new token.
  const stale = await ctx.db.select({ id: apiTokens.id, name: apiTokens.name }).from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNotNull(apiTokens.revokedAt), eq(apiTokens.name, name)))
  for (const row of stale) {
    await ctx.db.update(apiTokens).set({ name: revokedName(row) }).where(eq(apiTokens.id, row.id))
  }

  const now = nowOf(ctx)
  const token = generateApiToken()
  let row: ApiTokenRow | undefined
  try {
    [row] = await ctx.db.insert(apiTokens).values({
      userId,
      name,
      tokenHash: await sha256Hex(token),
      tokenPrefix: apiTokenPrefix(token),
      allowSecrets: data.allowSecrets,
      expiresAt: data.expiresInDays ? new Date(now.getTime() + data.expiresInDays * DAY_MS) : null,
      createdAt: now,
    }).returning()
  }
  catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError('conflict', `A token named "${name}" already exists`)
    throw error
  }
  if (!row) throw new Error('failed to create token')
  return { ...toTokenDto(row), token }
}

/** Revokes one of the current user's tokens and frees its name for reuse. */
export async function revokeToken(ctx: ServiceContext, id: string): Promise<void> {
  const userId = ownUserId(ctx)
  const [row] = await ctx.db.select().from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .limit(1)
  if (!row) throw new ServiceError('not_found', 'Token not found')
  await ctx.db.update(apiTokens)
    .set({ revokedAt: nowOf(ctx), name: revokedName(row) })
    .where(eq(apiTokens.id, row.id))
}

export interface AuthenticatedToken {
  tokenId: string
  tokenName: string
  userId: string
  allowSecrets: boolean
}

/**
 * Bearer authentication for `/mcp`: hash lookup, not revoked, not expired, user still exists.
 * Updates `last_used_at` at most once per minute.
 */
export async function authenticateApiToken(db: Db, plainToken: string, now: Date = new Date()): Promise<AuthenticatedToken | null> {
  const token = plainToken.trim()
  if (!token.startsWith(API_TOKEN_PREFIX) || token.length > 200) return null
  const hash = await sha256Hex(token)
  const [row] = await db
    .select({ token: apiTokens })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)))
    .limit(1)
  if (!row) return null
  const t = row.token
  if (t.expiresAt && t.expiresAt.getTime() <= now.getTime()) return null
  if (!t.lastUsedAt || now.getTime() - t.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, t.id))
  }
  return { tokenId: t.id, tokenName: t.name, userId: t.userId, allowSecrets: t.allowSecrets }
}
