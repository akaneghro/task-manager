// Public read-only share links (owner manages them; anyone with the token sees the project's tasks).

import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { projects, shareLinks, tasks } from '../db/schema'
import type { ShareLinkRow } from '../db/schema'
import type { Db } from '../db'
import { canSeeProject } from '../../shared/utils/permissions'
import { createShareLinkSchema } from '../../shared/schemas/project'
import type { PublicProjectDto, ShareLinkDto } from '../../shared/types/dto'
import { generateShareToken } from '../utils/crypto'
import { ServiceError, assertCan, nowOf } from './context'
import type { ServiceContext } from './context'
import { countTasksByStatus, emptyCounts, findProjectRowById, getVisibleProjectBySlug } from './lookup'
import { isoOrNull, parseInput, toProjectSummaryDto } from './projects'
import { buildTaskSummaries, projectInfoOf } from './taskMappers'

/** `last_used_at` is written at most once per this interval. */
const LAST_USED_THROTTLE_MS = 60_000

export function shareLinkUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/s/${token}`
}

export function toShareLinkDto(row: ShareLinkRow, siteUrl: string): ShareLinkDto {
  return {
    id: row.id,
    projectId: row.projectId,
    token: row.token,
    url: shareLinkUrl(siteUrl, row.token),
    label: row.label,
    lastUsedAt: isoOrNull(row.lastUsedAt),
    createdAt: row.createdAt.toISOString(),
  }
}

/** Active links of a project, newest first. */
export async function listShareLinks(ctx: ServiceContext, slug: string): Promise<ShareLinkDto[]> {
  const project = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.manage', { projectId: project.id })
  const rows = await ctx.db.select().from(shareLinks)
    .where(and(eq(shareLinks.projectId, project.id), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt))
  return rows.map(r => toShareLinkDto(r, ctx.siteUrl))
}

export async function createShareLink(ctx: ServiceContext, slug: string, input: { label?: string | null }): Promise<ShareLinkDto> {
  const project = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.manage', { projectId: project.id })
  const data = parseInput(createShareLinkSchema, input)
  const [row] = await ctx.db.insert(shareLinks).values({
    projectId: project.id,
    token: generateShareToken(),
    label: data.label ? data.label : null,
    createdAt: nowOf(ctx),
  }).returning()
  if (!row) throw new Error('failed to create share link')
  return toShareLinkDto(row, ctx.siteUrl)
}

export async function revokeShareLink(ctx: ServiceContext, id: string): Promise<void> {
  const [row] = await ctx.db.select().from(shareLinks)
    .where(and(eq(shareLinks.id, id), isNull(shareLinks.revokedAt)))
    .limit(1)
  const project = row ? await findProjectRowById(ctx.db, row.projectId) : null
  if (!row || !project || !canSeeProject(ctx.actor, project.id)) throw new ServiceError('not_found', 'Share link not found')
  assertCan(ctx, 'project.manage', { projectId: project.id })
  await ctx.db.update(shareLinks).set({ revokedAt: nowOf(ctx) }).where(eq(shareLinks.id, row.id))
}

/**
 * Resolves a public token to its (active) link on a non-deleted project. Updates `last_used_at` at most once per
 * minute. Returns null for unknown, revoked or orphaned tokens.
 */
export async function resolveShareToken(db: Db, token: string, now: Date = new Date()): Promise<{ shareLinkId: string, projectId: string } | null> {
  const trimmed = token.trim()
  if (!trimmed || trimmed.length > 200) return null
  const [row] = await db
    .select({ id: shareLinks.id, projectId: shareLinks.projectId, lastUsedAt: shareLinks.lastUsedAt })
    .from(shareLinks)
    .innerJoin(projects, eq(projects.id, shareLinks.projectId))
    .where(and(eq(shareLinks.token, trimmed), isNull(shareLinks.revokedAt), isNull(projects.deletedAt)))
    .limit(1)
  if (!row) return null
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS) {
    await db.update(shareLinks).set({ lastUsedAt: now }).where(eq(shareLinks.id, row.id))
  }
  return { shareLinkId: row.id, projectId: row.projectId }
}

/**
 * Public payload of a share link: project summary (no capabilities, no client), no links, no notes, and every
 * (open and closed) task of the project. Requires a `public` actor.
 */
export async function getPublicProject(ctx: ServiceContext): Promise<PublicProjectDto> {
  const actor = ctx.actor
  if (actor.kind !== 'public') throw new ServiceError('forbidden', 'Not a public share link')
  const project = await findProjectRowById(ctx.db, actor.projectId)
  if (!project) throw new ServiceError('not_found', 'Project not found')
  assertCan(ctx, 'project.read', { projectId: project.id })
  assertCan(ctx, 'task.read', { projectId: project.id })

  const counts = (await countTasksByStatus(ctx.db, [project.id])).get(project.id) ?? emptyCounts()
  const summary = toProjectSummaryDto(project, counts, actor)
  delete summary.capabilities
  summary.client = null

  const rows = await ctx.db.select().from(tasks)
    .where(and(eq(tasks.projectId, project.id), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position), asc(tasks.number))
  const info = projectInfoOf(project)
  const summaries = await buildTaskSummaries(ctx, rows.map(task => ({ task, project: info })), [project.id])
  // Public links cannot read comments: do not disclose how many there are.
  const taskDtos = summaries.map(t => ({ ...t, commentCount: 0 }))

  return { project: summary, links: [], tasks: taskDtos }
}
