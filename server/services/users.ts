// Users: GitHub login gate, profile sync and membership loading.

import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { projectMembers, projects, users } from '../db/schema'
import type { UserRow } from '../db/schema'
import type { Db } from '../db'
import type { MemberRole } from '../../shared/utils/enums'
import type { UserDto } from '../../shared/types/dto'

export interface GithubProfile {
  id: number
  login: string
  name?: string | null
  avatarUrl?: string | null
  email?: string | null
}

export interface OwnerConfig {
  /** `NUXT_OWNER_GITHUB_LOGIN`. Only used until the owner row exists (then pinned by github id). */
  login: string
  /** Optional `NUXT_OWNER_GITHUB_ID` (numeric string) to also require the id on first login. */
  githubId?: string
}

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    githubLogin: row.githubLogin,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
  }
}

export async function getUserById(db: Db, id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row ?? null
}

async function findUserByGithubId(db: Db, githubId: number): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1)
  return row ?? null
}

function profileFields(gh: GithubProfile, now: Date) {
  return {
    githubLogin: gh.login,
    name: gh.name ?? null,
    avatarUrl: gh.avatarUrl ?? null,
    email: gh.email ?? null,
    lastLoginAt: now,
    updatedAt: now,
  }
}

async function upsertUser(db: Db, gh: GithubProfile, role: UserRow['role'], now: Date): Promise<UserRow> {
  const existing = await findUserByGithubId(db, gh.id)
  if (existing) {
    const [updated] = await db.update(users)
      .set({ ...profileFields(gh, now), role })
      .where(eq(users.id, existing.id))
      .returning()
    if (!updated) throw new Error('failed to update user')
    return updated
  }
  const [inserted] = await db.insert(users)
    .values({ githubId: gh.id, ...profileFields(gh, now), role, createdAt: now })
    .returning()
  if (!inserted) throw new Error('failed to insert user')
  return inserted
}

/**
 * Login gate. Returns the (created or refreshed) user, or `null` when the GitHub account may not sign in.
 *
 * - Owner: once an owner row exists it is matched by `github_id` only (login renames are irrelevant).
 *   Before that, the configured login (case-insensitive, plus the github id when configured) bootstraps it.
 * - Anyone else needs an active invitation (`project_members`, not revoked) on a non-deleted project, matched
 *   by GitHub login (case-insensitive) or by an already linked user id. Matching invitations get linked/accepted.
 */
export async function resolveGithubLogin(db: Db, gh: GithubProfile, owner: OwnerConfig, now: Date = new Date()): Promise<UserRow | null> {
  if (!Number.isSafeInteger(gh.id) || gh.id <= 0 || !gh.login) return null

  const [ownerRow] = await db.select().from(users).where(eq(users.role, 'owner')).limit(1)
  if (ownerRow) {
    if (ownerRow.githubId === gh.id) return upsertUser(db, gh, 'owner', now)
  }
  else {
    const ownerLogin = owner.login.trim().toLowerCase()
    const ownerId = owner.githubId?.trim()
    const loginMatches = ownerLogin !== '' && gh.login.toLowerCase() === ownerLogin
    const idMatches = !ownerId || ownerId === String(gh.id)
    if (loginMatches && idMatches) return upsertUser(db, gh, 'owner', now)
  }

  const existing = await findUserByGithubId(db, gh.id)
  const login = gh.login.toLowerCase()
  const matchInvitation = existing
    ? or(sql`lower(${projectMembers.githubLogin}) = ${login}`, eq(projectMembers.userId, existing.id))
    : sql`lower(${projectMembers.githubLogin}) = ${login}`

  const invitations = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(matchInvitation, isNull(projectMembers.revokedAt), isNull(projects.deletedAt)))
  if (invitations.length === 0) return null

  const user = await upsertUser(db, gh, 'member', now)
  await db.update(projectMembers)
    .set({ userId: user.id, acceptedAt: sql`coalesce(${projectMembers.acceptedAt}, ${now.getTime()})` })
    .where(inArray(projectMembers.id, invitations.map(i => i.id)))
  return user
}

/** Active memberships (not revoked, non-deleted projects) of a user: `{ [projectId]: role }`. */
export async function loadMemberships(db: Db, userId: string): Promise<Record<string, MemberRole>> {
  const rows = await db
    .select({ projectId: projectMembers.projectId, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projectMembers.revokedAt), isNull(projects.deletedAt)))
  const result: Record<string, MemberRole> = {}
  for (const row of rows) result[row.projectId] = row.role
  return result
}

/** Most recently seen non-owner user with this GitHub login (case-insensitive), if any. */
export async function findMemberUserByLogin(db: Db, login: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users)
    .where(and(sql`lower(${users.githubLogin}) = ${login.trim().toLowerCase()}`, eq(users.role, 'member')))
    .orderBy(desc(users.lastLoginAt))
    .limit(1)
  return row ?? null
}

/** The owner row, if it exists yet. */
export async function findOwnerUser(db: Db): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.role, 'owner')).limit(1)
  return row ?? null
}
