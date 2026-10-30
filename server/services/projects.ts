// Projects: list / detail / create / update / notes / links / soft delete, plus the Inbox bootstrap.

import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { projectLinks, projects } from '../db/schema'
import type { ProjectLinkRow, ProjectRow } from '../db/schema'
import type { Db } from '../db'
import { INBOX_PROJECT, PROJECT_STATUSES } from '../../shared/utils/enums'
import type { ProjectStatus } from '../../shared/utils/enums'
import type { Actor } from '../../shared/utils/permissions'
import { can, canSeeProject, projectCapabilities } from '../../shared/utils/permissions'
import { slugify } from '../../shared/utils/taskKey'
import {
  createProjectSchema,
  projectLinkInputSchema,
  updateProjectNotesSchema,
  updateProjectSchema,
} from '../../shared/schemas/project'
import type {
  CreateProjectInput,
  ProjectLinkInput,
  UpdateProjectInput,
  UpdateProjectNotesInput,
} from '../../shared/schemas/project'
import { slugSchema } from '../../shared/schemas/common'
import type { ProjectDetailDto, ProjectLinkDto, ProjectSummaryDto, TaskCountsByStatus } from '../../shared/types/dto'
import { ServiceError, actorSource, assertCan, nowOf } from './context'
import type { ServiceContext } from './context'
import { countTasksByStatus, emptyCounts, getVisibleProjectBySlug, openCountOf } from './lookup'

// ---------------------------------------------------------------------------------------------------------------
// Small helpers reused by the sibling services (members, share links, accounts, tokens).
// ---------------------------------------------------------------------------------------------------------------

/** Validates service input with a shared zod schema; failures become `ServiceError('invalid')`. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues
      .map(issue => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
      .join('; ')
    throw new ServiceError('invalid', message || 'Invalid input', result.error.issues)
  }
  return result.data
}

/** True when a DB error (or its cause chain) is a UNIQUE constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof Error) {
      if (/UNIQUE constraint failed/i.test(current.message)) return true
      current = current.cause
    }
    else {
      return false
    }
  }
  return false
}

export function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

// ---------------------------------------------------------------------------------------------------------------
// DTO mappers
// ---------------------------------------------------------------------------------------------------------------

export function toProjectLinkDto(row: ProjectLinkRow): ProjectLinkDto {
  return { id: row.id, kind: row.kind, label: row.label, url: row.url, position: row.position }
}

/**
 * Summary DTO. `client` is hidden for actors that cannot read notes (public links) and `capabilities` is only
 * included for authenticated actors.
 */
export function toProjectSummaryDto(row: ProjectRow, counts: TaskCountsByStatus, actor: Actor): ProjectSummaryDto {
  const dto: ProjectSummaryDto = {
    id: row.id,
    slug: row.slug,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    client: can(actor, 'project.readNotes', { projectId: row.id }) ? row.client : null,
    color: row.color,
    isInbox: row.isInbox,
    version: row.version,
    counts,
    openCount: openCountOf(counts),
    updatedAt: row.updatedAt.toISOString(),
  }
  if (actor.kind !== 'public') dto.capabilities = projectCapabilities(actor, row.id)
  return dto
}

/** Detail DTO. Notes and links are blanked for actors without `project.readNotes`. */
export function toProjectDetailDto(
  row: ProjectRow,
  counts: TaskCountsByStatus,
  links: readonly ProjectLinkRow[],
  actor: Actor,
): ProjectDetailDto {
  const readNotes = can(actor, 'project.readNotes', { projectId: row.id })
  return {
    ...toProjectSummaryDto(row, counts, actor),
    notes: readNotes ? row.notes : '',
    links: readNotes ? [...links].sort((a, b) => a.position - b.position).map(toProjectLinkDto) : [],
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  }
}

async function loadLinks(db: Db, projectId: string): Promise<ProjectLinkRow[]> {
  return db.select().from(projectLinks)
    .where(eq(projectLinks.projectId, projectId))
    .orderBy(asc(projectLinks.position), asc(projectLinks.createdAt))
}

/** Builds the detail DTO of a project row for the context's actor (loads counts and, when allowed, links). */
export async function buildProjectDetail(ctx: ServiceContext, row: ProjectRow): Promise<ProjectDetailDto> {
  const counts = (await countTasksByStatus(ctx.db, [row.id])).get(row.id) ?? emptyCounts()
  const links = can(ctx.actor, 'project.readNotes', { projectId: row.id }) ? await loadLinks(ctx.db, row.id) : []
  return toProjectDetailDto(row, counts, links, ctx.actor)
}

async function reloadDetail(ctx: ServiceContext, id: string): Promise<ProjectDetailDto> {
  const [row] = await ctx.db.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!row || row.deletedAt) throw new ServiceError('not_found', 'Project not found')
  return buildProjectDetail(ctx, row)
}

// ---------------------------------------------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------------------------------------------

/** Creates the Inbox project when missing (idempotent). */
export async function ensureInbox(db: Db): Promise<ProjectRow> {
  const findInbox = async () => {
    const [row] = await db.select().from(projects)
      .where(or(eq(projects.isInbox, true), eq(projects.slug, INBOX_PROJECT.slug)))
      .limit(1)
    return row ?? null
  }
  const existing = await findInbox()
  if (existing) {
    if (existing.deletedAt || !existing.isInbox) {
      const [fixed] = await db.update(projects)
        .set({ deletedAt: null, isInbox: true })
        .where(eq(projects.id, existing.id))
        .returning()
      if (fixed) return fixed
    }
    return existing
  }
  await db.insert(projects).values({
    slug: INBOX_PROJECT.slug,
    key: INBOX_PROJECT.key,
    name: INBOX_PROJECT.name,
    status: 'development',
    isInbox: true,
    createdBy: 'system',
    updatedBy: 'system',
  }).onConflictDoNothing()
  const created = await findInbox()
  if (!created) throw new Error('failed to create the Inbox project')
  return created
}

// ---------------------------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------------------------

export interface ListProjectsQuery {
  status?: ProjectStatus[]
  includeArchived?: boolean
}

const STATUS_ORDER = new Map<ProjectStatus, number>(PROJECT_STATUSES.map((s, i) => [s, i]))

function compareProjects(a: ProjectRow, b: ProjectRow): number {
  if (a.isInbox !== b.isInbox) return a.isInbox ? -1 : 1
  const byStatus = (STATUS_ORDER.get(a.status) ?? 0) - (STATUS_ORDER.get(b.status) ?? 0)
  if (byStatus !== 0) return byStatus
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** Visible projects: Inbox first, then by status order, then by name. Archived only when asked for. */
export async function listProjects(ctx: ServiceContext, query: ListProjectsQuery = {}): Promise<ProjectSummaryDto[]> {
  assertCan(ctx, 'project.list')
  const rows = await ctx.db.select().from(projects).where(isNull(projects.deletedAt))
  const statuses = query.status && query.status.length > 0 ? new Set(query.status) : null
  const visible = rows
    .filter(row => canSeeProject(ctx.actor, row.id))
    .filter((row) => {
      if (statuses) return statuses.has(row.status)
      return query.includeArchived === true || row.status !== 'archived'
    })
    .sort(compareProjects)
  const counts = await countTasksByStatus(ctx.db, visible.map(r => r.id))
  return visible.map(row => toProjectSummaryDto(row, counts.get(row.id) ?? emptyCounts(), ctx.actor))
}

export async function getProject(ctx: ServiceContext, slug: string): Promise<ProjectDetailDto> {
  const row = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.read', { projectId: row.id })
  return buildProjectDetail(ctx, row)
}

// ---------------------------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------------------------

async function assertSlugFree(db: Db, slug: string, exceptId?: string): Promise<void> {
  const [row] = await db.select({ id: projects.id, deletedAt: projects.deletedAt }).from(projects)
    .where(eq(projects.slug, slug)).limit(1)
  if (row && row.id !== exceptId) {
    throw new ServiceError('conflict', row.deletedAt
      ? `Slug "${slug}" is still reserved by a deleted project; choose another slug`
      : `Slug "${slug}" is already used by another project`)
  }
}

async function assertKeyFree(db: Db, key: string): Promise<void> {
  const [row] = await db.select({ id: projects.id, deletedAt: projects.deletedAt }).from(projects)
    .where(eq(projects.key, key)).limit(1)
  if (row) {
    throw new ServiceError('conflict', row.deletedAt
      ? `Key "${key}" is still reserved by a deleted project; choose another key`
      : `Key "${key}" is already used by another project`)
  }
}

function linkValues(projectId: string, links: readonly ProjectLinkInput[], now: Date) {
  return links.map((link, index) => ({
    projectId,
    kind: link.kind ?? 'other',
    label: link.label,
    url: link.url,
    position: index,
    createdAt: now,
  }))
}

export async function createProject(ctx: ServiceContext, input: CreateProjectInput): Promise<ProjectDetailDto> {
  assertCan(ctx, 'project.create')
  const data = parseInput(createProjectSchema, input)
  const slug = data.slug ?? parseDerivedSlug(data.name)
  if (slug === INBOX_PROJECT.slug) throw new ServiceError('invalid', `Slug "${slug}" is reserved`)
  if (data.key === INBOX_PROJECT.key) throw new ServiceError('invalid', `Key "${data.key}" is reserved`)
  await assertSlugFree(ctx.db, slug)
  await assertKeyFree(ctx.db, data.key)

  const now = nowOf(ctx)
  const source = actorSource(ctx)
  const id = crypto.randomUUID()
  try {
    await ctx.db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id,
        slug,
        key: data.key,
        name: data.name,
        description: data.description,
        notes: data.notes,
        status: data.status,
        client: data.client ?? null,
        color: data.color ?? null,
        createdAt: now,
        updatedAt: now,
        createdBy: source,
        updatedBy: source,
      })
      if (data.links && data.links.length > 0) await tx.insert(projectLinks).values(linkValues(id, data.links, now))
    })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError('conflict', `A project with slug "${slug}" or key "${data.key}" already exists`)
    throw error
  }
  return reloadDetail(ctx, id)
}

function parseDerivedSlug(name: string): string {
  const derived = slugify(name)
  const result = slugSchema.safeParse(derived)
  if (!derived || !result.success) throw new ServiceError('invalid', 'Cannot derive a slug from the project name; provide one')
  return result.data
}

async function conflictError(ctx: ServiceContext, id: string, message = 'The project was modified by someone else'): Promise<ServiceError> {
  return new ServiceError('conflict', message, await reloadDetail(ctx, id))
}

export async function updateProject(ctx: ServiceContext, slug: string, input: UpdateProjectInput): Promise<ProjectDetailDto> {
  const row = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.update', { projectId: row.id })
  const data = parseInput(updateProjectSchema, input)
  if (row.version !== data.expectedVersion) throw await conflictError(ctx, row.id)

  if (row.isInbox) {
    if (data.slug !== undefined && data.slug !== row.slug) throw new ServiceError('invalid', 'The Inbox slug cannot be changed')
    if (data.status === 'archived') throw new ServiceError('invalid', 'The Inbox cannot be archived')
  }
  if (data.slug !== undefined && data.slug !== row.slug) {
    if (data.slug === INBOX_PROJECT.slug) throw new ServiceError('invalid', `Slug "${data.slug}" is reserved`)
    await assertSlugFree(ctx.db, data.slug, row.id)
  }

  const now = nowOf(ctx)
  const patch: Partial<typeof projects.$inferInsert> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.slug !== undefined) patch.slug = data.slug
  if (data.status !== undefined) patch.status = data.status
  if (data.description !== undefined) patch.description = data.description
  if (data.notes !== undefined) patch.notes = data.notes
  if (data.client !== undefined) patch.client = data.client
  if (data.color !== undefined) patch.color = data.color

  let updated: { id: string }[]
  try {
    updated = await ctx.db.update(projects)
      .set({ ...patch, version: sql`${projects.version} + 1`, updatedAt: now, updatedBy: actorSource(ctx) })
      .where(and(eq(projects.id, row.id), eq(projects.version, data.expectedVersion), isNull(projects.deletedAt)))
      .returning({ id: projects.id })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError('conflict', `Slug "${data.slug ?? row.slug}" is already used by another project`)
    throw error
  }
  if (updated.length === 0) throw await conflictError(ctx, row.id)
  return reloadDetail(ctx, row.id)
}

/** Appends to or replaces the project notes (`replace` requires the current version). Bumps the version. */
export async function updateProjectNotes(ctx: ServiceContext, slug: string, input: UpdateProjectNotesInput): Promise<ProjectDetailDto> {
  const row = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.updateNotes', { projectId: row.id })
  const data = parseInput(updateProjectNotesSchema, input)
  const now = nowOf(ctx)
  const base = { version: sql`${projects.version} + 1`, updatedAt: now, updatedBy: actorSource(ctx) }

  if (data.mode === 'append') {
    if (data.content.trim() === '') return buildProjectDetail(ctx, row)
    // Single statement so concurrent appends never lose each other.
    await ctx.db.update(projects)
      .set({
        ...base,
        notes: sql`case when ${projects.notes} = '' then ${data.content} else ${projects.notes} || char(10) || char(10) || ${data.content} end`,
      })
      .where(and(eq(projects.id, row.id), isNull(projects.deletedAt)))
    return reloadDetail(ctx, row.id)
  }

  const expected = data.expectedVersion
  if (expected === undefined || row.version !== expected) throw await conflictError(ctx, row.id)
  const updated = await ctx.db.update(projects)
    .set({ ...base, notes: data.content })
    .where(and(eq(projects.id, row.id), eq(projects.version, expected), isNull(projects.deletedAt)))
    .returning({ id: projects.id })
  if (updated.length === 0) throw await conflictError(ctx, row.id)
  return reloadDetail(ctx, row.id)
}

/** Replaces every link of the project (order = array order). */
export async function replaceProjectLinks(ctx: ServiceContext, slug: string, links: ProjectLinkInput[]): Promise<ProjectLinkDto[]> {
  const row = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.updateNotes', { projectId: row.id })
  const parsed = links.map(link => parseInput(projectLinkInputSchema, link))
  if (parsed.length > 30) throw new ServiceError('invalid', 'At most 30 links per project')
  const now = nowOf(ctx)
  await ctx.db.transaction(async (tx) => {
    await tx.delete(projectLinks).where(eq(projectLinks.projectId, row.id))
    if (parsed.length > 0) await tx.insert(projectLinks).values(linkValues(row.id, parsed, now))
    await tx.update(projects).set({ updatedAt: now, updatedBy: actorSource(ctx) }).where(eq(projects.id, row.id))
  })
  return (await loadLinks(ctx.db, row.id)).map(toProjectLinkDto)
}

/** Soft delete. The Inbox cannot be deleted. */
export async function deleteProject(ctx: ServiceContext, slug: string): Promise<void> {
  const row = await getVisibleProjectBySlug(ctx, slug)
  assertCan(ctx, 'project.delete', { projectId: row.id })
  if (row.isInbox) throw new ServiceError('forbidden', 'The Inbox cannot be deleted')
  const now = nowOf(ctx)
  await ctx.db.update(projects)
    .set({ deletedAt: now, updatedAt: now, updatedBy: actorSource(ctx) })
    .where(eq(projects.id, row.id))
}
