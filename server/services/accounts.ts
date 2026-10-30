// Credentials vault. Owner only (vault.*); MCP tokens may read secrets flagged "share with Claude" when the token
// has `allow_secrets` (secret.readShared). Secrets are decrypted only here and every access is recorded.
// NEVER log secrets, plaintext or ciphertext.

import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { projectAccounts } from '../db/schema'
import type { ProjectAccountRow, ProjectRow } from '../db/schema'
import { canSeeProject } from '../../shared/utils/permissions'
import { createAccountSchema, updateAccountSchema } from '../../shared/schemas/project'
import type { CreateAccountInput, UpdateAccountInput } from '../../shared/schemas/project'
import type { AccountDto } from '../../shared/types/dto'
import { decryptSecret, encryptSecret } from '../utils/crypto'
import { assertCan, because, nowOf, ServiceError } from './context'
import type { ServiceContext } from './context'
import { findProjectRowById, getVisibleProjectBySlug } from './lookup'
import { isoOrNull, parseInput } from './projects'

const REASON_MAX = 200

export function toAccountDto(row: ProjectAccountRow): AccountDto {
  return {
    id: row.id,
    projectId: row.projectId,
    service: row.service,
    url: row.url,
    username: row.username,
    notes: row.notes,
    hasSecret: row.secretEnc !== null,
    shareWithClaude: row.shareWithClaude,
    lastAccessedAt: isoOrNull(row.lastAccessedAt),
    lastAccessedSource: row.lastAccessedSource,
    accessCount: row.accessCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function requireVaultKey(ctx: ServiceContext): string {
  if (!ctx.vaultKey) throw new ServiceError('invalid', 'Vault key not configured', because('vault_unavailable'))
  return ctx.vaultKey
}

async function encrypt(ctx: ServiceContext, secret: string, accountId: string): Promise<string> {
  try {
    return await encryptSecret(secret, requireVaultKey(ctx), accountId)
  }
  catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError('invalid', 'Vault key not configured correctly', because('vault_unavailable'))
  }
}

async function decrypt(ctx: ServiceContext, row: ProjectAccountRow): Promise<string> {
  if (row.secretEnc === null) throw new ServiceError('not_found', 'This account has no stored secret')
  const key = requireVaultKey(ctx)
  try {
    return await decryptSecret(row.secretEnc, key, row.id)
  }
  catch {
    throw new ServiceError('invalid', 'The secret cannot be decrypted (wrong vault key or corrupted data)', because('vault_unavailable'))
  }
}

/** Loads a non-deleted account whose project is visible to the actor; `not_found` otherwise. */
async function getVisibleAccount(ctx: ServiceContext, id: string): Promise<{ account: ProjectAccountRow, project: ProjectRow }> {
  const [account] = await ctx.db.select().from(projectAccounts)
    .where(and(eq(projectAccounts.id, id), isNull(projectAccounts.deletedAt)))
    .limit(1)
  const project = account ? await findProjectRowById(ctx.db, account.projectId) : null
  if (!account || !project || !canSeeProject(ctx.actor, project.id)) throw new ServiceError('not_found', 'Account not found')
  return { account, project }
}

async function reloadAccount(ctx: ServiceContext, id: string): Promise<AccountDto> {
  const [row] = await ctx.db.select().from(projectAccounts).where(eq(projectAccounts.id, id)).limit(1)
  if (!row) throw new ServiceError('not_found', 'Account not found')
  return toAccountDto(row)
}

/** Increments the access counter and records when/who/why. */
async function recordAccess(ctx: ServiceContext, id: string, source: string): Promise<void> {
  await ctx.db.update(projectAccounts)
    .set({
      lastAccessedAt: nowOf(ctx),
      lastAccessedSource: source,
      accessCount: sql`${projectAccounts.accessCount} + 1`,
    })
    .where(eq(projectAccounts.id, id))
}

function nonEmpty(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value
}

// ---------------------------------------------------------------------------------------------------------------
// Owner (UI)
// ---------------------------------------------------------------------------------------------------------------

export async function listAccounts(ctx: ServiceContext, slug: string): Promise<AccountDto[]> {
  const project = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'vault.read', { projectId: project.id })
  const rows = await ctx.db.select().from(projectAccounts)
    .where(and(eq(projectAccounts.projectId, project.id), isNull(projectAccounts.deletedAt)))
    .orderBy(asc(sql`lower(${projectAccounts.service})`), asc(projectAccounts.createdAt))
  return rows.map(toAccountDto)
}

export async function createAccount(ctx: ServiceContext, slug: string, input: CreateAccountInput): Promise<AccountDto> {
  const project = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'vault.write', { projectId: project.id })
  const data = parseInput(createAccountSchema, input)
  const id = crypto.randomUUID()
  const secret = nonEmpty(data.secret)
  const secretEnc = secret === null ? null : await encrypt(ctx, secret, id)
  const now = nowOf(ctx)
  await ctx.db.insert(projectAccounts).values({
    id,
    projectId: project.id,
    service: data.service,
    url: nonEmpty(data.url),
    username: nonEmpty(data.username),
    notes: data.notes,
    secretEnc,
    shareWithClaude: data.shareWithClaude,
    createdAt: now,
    updatedAt: now,
  })
  return reloadAccount(ctx, id)
}

/** Partial update. `secret`: undefined keeps it, null (or '') clears it, a string re-encrypts it. */
export async function updateAccount(ctx: ServiceContext, id: string, input: UpdateAccountInput): Promise<AccountDto> {
  const { account, project } = await getVisibleAccount(ctx, id)
  assertCan(ctx, 'vault.write', { projectId: project.id })
  const data = parseInput(updateAccountSchema, input)
  const patch: Partial<typeof projectAccounts.$inferInsert> = { updatedAt: nowOf(ctx) }
  if (data.service !== undefined) patch.service = data.service
  if (data.url !== undefined) patch.url = nonEmpty(data.url)
  if (data.username !== undefined) patch.username = nonEmpty(data.username)
  if (data.notes !== undefined) patch.notes = data.notes
  if (data.shareWithClaude !== undefined) patch.shareWithClaude = data.shareWithClaude
  if (data.secret !== undefined) {
    const secret = nonEmpty(data.secret)
    patch.secretEnc = secret === null ? null : await encrypt(ctx, secret, account.id)
  }
  await ctx.db.update(projectAccounts).set(patch).where(eq(projectAccounts.id, account.id))
  return reloadAccount(ctx, account.id)
}

/** Soft delete. The ciphertext is wiped as well: deleted credentials should not linger in the database. */
export async function deleteAccount(ctx: ServiceContext, id: string): Promise<void> {
  const { account, project } = await getVisibleAccount(ctx, id)
  assertCan(ctx, 'vault.write', { projectId: project.id })
  const now = nowOf(ctx)
  await ctx.db.update(projectAccounts)
    .set({ deletedAt: now, updatedAt: now, secretEnc: null, shareWithClaude: false })
    .where(eq(projectAccounts.id, account.id))
}

/** Decrypts a secret for the owner UI and records the access. */
export async function revealSecret(ctx: ServiceContext, id: string): Promise<{ secret: string }> {
  const { account, project } = await getVisibleAccount(ctx, id)
  assertCan(ctx, 'vault.reveal', { projectId: project.id })
  const secret = await decrypt(ctx, account)
  await recordAccess(ctx, account.id, ctx.actor.source)
  return { secret }
}

// ---------------------------------------------------------------------------------------------------------------
// MCP (secret.readShared)
// ---------------------------------------------------------------------------------------------------------------

/** Metadata of the accounts of a project that are shared with Claude and have a secret. */
export async function listSharedSecrets(ctx: ServiceContext, slug: string): Promise<AccountDto[]> {
  const project = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'secret.readShared', { projectId: project.id })
  const rows = await ctx.db.select().from(projectAccounts)
    .where(and(
      eq(projectAccounts.projectId, project.id),
      isNull(projectAccounts.deletedAt),
      eq(projectAccounts.shareWithClaude, true),
      isNotNull(projectAccounts.secretEnc),
    ))
    .orderBy(asc(sql`lower(${projectAccounts.service})`), asc(projectAccounts.createdAt))
  return rows.map(toAccountDto)
}

export interface SharedSecretDto {
  accountId: string
  service: string
  username: string | null
  url: string | null
  secret: string
}

/**
 * Returns a secret flagged "share with Claude" to an actor allowed to read shared secrets, and records the access
 * as `<source> (<reason>)`.
 */
export async function getSharedSecret(ctx: ServiceContext, accountId: string, reason: string): Promise<SharedSecretDto> {
  const { account, project } = await getVisibleAccount(ctx, accountId)
  assertCan(ctx, 'secret.readShared', { projectId: project.id })
  if (!account.shareWithClaude) throw new ServiceError('forbidden', 'This secret is not shared with Claude', because('secret_not_shared'))
  const secret = await decrypt(ctx, account)
  const why = reason.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX)
  await recordAccess(ctx, account.id, why ? `${ctx.actor.source} (${why})` : ctx.actor.source)
  return {
    accountId: account.id,
    service: account.service,
    username: account.username,
    url: account.url,
    secret,
  }
}
