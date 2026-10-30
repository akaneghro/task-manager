// Project members (GitHub-login invitations). Owner only (`project.manage`).

import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { projectMembers, users } from '../db/schema'
import type { ProjectMemberRow, ProjectRow } from '../db/schema'
import type { MemberRole } from '../../shared/utils/enums'
import { canSeeProject } from '../../shared/utils/permissions'
import { inviteMemberSchema, updateMemberSchema } from '../../shared/schemas/project'
import type { InviteMemberInput } from '../../shared/schemas/project'
import type { MemberDto } from '../../shared/types/dto'
import { assertCan, because, nowOf, ServiceError } from './context'
import type { ServiceContext } from './context'
import { findProjectRowById, getVisibleProjectBySlug } from './lookup'
import { isUniqueViolation, isoOrNull, parseInput } from './projects'
import { findOwnerUser } from './users'

export function toMemberDto(row: ProjectMemberRow, avatarUrl: string | null): MemberDto {
  return {
    id: row.id,
    projectId: row.projectId,
    githubLogin: row.githubLogin,
    role: row.role,
    userId: row.userId,
    avatarUrl,
    invitedAt: row.invitedAt.toISOString(),
    acceptedAt: isoOrNull(row.acceptedAt),
  }
}

async function loadMemberDto(ctx: ServiceContext, memberId: string): Promise<MemberDto> {
  const [row] = await ctx.db
    .select({ member: projectMembers, avatarUrl: users.avatarUrl })
    .from(projectMembers)
    .leftJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.id, memberId))
    .limit(1)
  if (!row) throw new ServiceError('not_found', 'Member not found')
  return toMemberDto(row.member, row.avatarUrl ?? null)
}

/** Loads an active member row whose project the actor can see and manage. */
async function getManageableMember(ctx: ServiceContext, memberId: string): Promise<{ member: ProjectMemberRow, project: ProjectRow }> {
  const [member] = await ctx.db.select().from(projectMembers)
    .where(and(eq(projectMembers.id, memberId), isNull(projectMembers.revokedAt)))
    .limit(1)
  const project = member ? await findProjectRowById(ctx.db, member.projectId) : null
  if (!member || !project || !canSeeProject(ctx.actor, project.id)) throw new ServiceError('not_found', 'Member not found')
  assertCan(ctx, 'project.manage', { projectId: project.id })
  return { member, project }
}

/** Active (not revoked) members of a project, by login. */
export async function listMembers(ctx: ServiceContext, slug: string): Promise<MemberDto[]> {
  const project = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.manage', { projectId: project.id })
  const rows = await ctx.db
    .select({ member: projectMembers, avatarUrl: users.avatarUrl })
    .from(projectMembers)
    .leftJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, project.id), isNull(projectMembers.revokedAt)))
    .orderBy(asc(sql`lower(${projectMembers.githubLogin})`))
  return rows.map(r => toMemberDto(r.member, r.avatarUrl ?? null))
}

/**
 * Invites a GitHub login. Re-inviting a revoked login reactivates its row; inviting an active member is a conflict.
 * The invitation stays unlinked until the invitee signs in with GitHub (see `resolveGithubLogin`).
 */
export async function inviteMember(ctx: ServiceContext, slug: string, input: InviteMemberInput): Promise<MemberDto> {
  const project = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.manage', { projectId: project.id })
  const data = parseInput(inviteMemberSchema, input)
  const login = data.githubLogin
  const lower = login.toLowerCase()

  const owner = await findOwnerUser(ctx.db)
  if (owner && owner.githubLogin.toLowerCase() === lower) {
    throw new ServiceError('invalid', 'The owner already has full access and cannot be invited', because('owner_invite'))
  }

  // The invitation is never pre-linked to a user found by its stored login: that login may be stale (renamed
  // account, name taken over by someone else). The login gate links it on the invitee's next GitHub sign-in,
  // when the login comes from the live GitHub profile.
  const now = nowOf(ctx)
  const [existing] = await ctx.db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), sql`lower(${projectMembers.githubLogin}) = ${lower}`))
    .limit(1)

  if (existing) {
    if (!existing.revokedAt) throw new ServiceError('conflict', `"${existing.githubLogin}" is already a member of this project`, because('already_member'))
    await ctx.db.update(projectMembers)
      .set({ githubLogin: login, role: data.role, userId: null, invitedAt: now, acceptedAt: null, revokedAt: null })
      .where(eq(projectMembers.id, existing.id))
    return loadMemberDto(ctx, existing.id)
  }

  const id = crypto.randomUUID()
  try {
    await ctx.db.insert(projectMembers).values({
      id,
      projectId: project.id,
      githubLogin: login,
      role: data.role,
      userId: null,
      invitedAt: now,
    })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError('conflict', `"${login}" is already a member of this project`, because('already_member'))
    throw error
  }
  return loadMemberDto(ctx, id)
}

export async function updateMember(ctx: ServiceContext, memberId: string, input: { role: MemberRole }): Promise<MemberDto> {
  const { member } = await getManageableMember(ctx, memberId)
  const data = parseInput(updateMemberSchema, input)
  if (data.role !== member.role) {
    await ctx.db.update(projectMembers).set({ role: data.role }).where(eq(projectMembers.id, member.id))
  }
  return loadMemberDto(ctx, member.id)
}

/** Revokes access (the row is kept so the login can be re-invited later). */
export async function revokeMember(ctx: ServiceContext, memberId: string): Promise<void> {
  const { member } = await getManageableMember(ctx, memberId)
  await ctx.db.update(projectMembers).set({ revokedAt: nowOf(ctx) }).where(eq(projectMembers.id, member.id))
}
