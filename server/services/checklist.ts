// Task checklist items. Changes bump the task's `updated_at` but never its `version`.

import { and, asc, eq, sql } from 'drizzle-orm'
import { taskChecklistItems } from '../db/schema'
import type { ChecklistItemRow } from '../db/schema'
import { addChecklistItemsSchema, updateChecklistItemSchema } from '../../shared/schemas/task'
import { can } from '../../shared/utils/permissions'
import { positionBetween } from '../../shared/utils/position'
import type { ChecklistItemDto } from '../../shared/types/dto'
import { ServiceError, actorSource, assertCan, nowOf } from './context'
import type { ServiceContext } from './context'
import {
  loadChecklist,
  loadTaskWithProjectById,
  parseServiceInput,
  resolveTaskWithProject,
  toChecklistItemDto,
  touchTask,
} from './taskMappers'
import type { TaskWithProject } from './taskMappers'

export interface UpdateChecklistItemInput {
  text?: string
  done?: boolean
  position?: number
}

export interface ToggleChecklistItemInput {
  itemId?: string
  /** 1-based index in display order. */
  index?: number
  done: boolean
}

/** Appends items at the end of the checklist. Returns the full list. */
export async function addChecklistItems(ctx: ServiceContext, ref: string, items: string[]): Promise<ChecklistItemDto[]> {
  const item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'task.write', { projectId: item.project.id })
  const input = parseServiceInput(addChecklistItemsSchema, { items })
  const [maxRow] = await ctx.db.select({ max: sql<number | null>`max(${taskChecklistItems.position})` })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, item.task.id))
  let position: number | null = maxRow?.max === null || maxRow?.max === undefined ? null : Number(maxRow.max)
  const now = nowOf(ctx)
  const values = input.items.map((text) => {
    position = positionBetween(position, null)
    return { taskId: item.task.id, text, position, createdAt: now }
  })
  await ctx.db.insert(taskChecklistItems).values(values)
  await touchTask(ctx, item.task.id)
  return loadChecklist(ctx.db, item.task.id)
}

/** Loads an item whose task is visible and writable by the actor. */
async function loadWritableItem(ctx: ServiceContext, itemId: string): Promise<{ row: ChecklistItemRow, item: TaskWithProject }> {
  const [row] = await ctx.db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1)
  const item = row ? await loadTaskWithProjectById(ctx.db, row.taskId) : null
  if (!row || !item || item.task.deletedAt || !can(ctx.actor, 'task.read', { projectId: item.project.id })) {
    throw new ServiceError('not_found', 'Checklist item not found')
  }
  assertCan(ctx, 'task.write', { projectId: item.project.id })
  return { row, item }
}

function doneColumns(ctx: ServiceContext, done: boolean) {
  return done
    ? { done: true, doneAt: nowOf(ctx), doneBy: actorSource(ctx) }
    : { done: false, doneAt: null, doneBy: null }
}

async function writeItem(
  ctx: ServiceContext,
  row: ChecklistItemRow,
  changes: Partial<typeof taskChecklistItems.$inferInsert>,
): Promise<ChecklistItemDto> {
  if (Object.keys(changes).length === 0) return toChecklistItemDto(row)
  const [updated] = await ctx.db.update(taskChecklistItems).set(changes).where(eq(taskChecklistItems.id, row.id)).returning()
  if (!updated) throw new ServiceError('not_found', 'Checklist item not found')
  await touchTask(ctx, row.taskId)
  return toChecklistItemDto(updated)
}

export async function updateChecklistItem(ctx: ServiceContext, itemId: string, rawInput: UpdateChecklistItemInput): Promise<ChecklistItemDto> {
  const { row } = await loadWritableItem(ctx, itemId)
  const input = parseServiceInput(updateChecklistItemSchema, rawInput)
  const changes: Partial<typeof taskChecklistItems.$inferInsert> = {}
  if (input.text !== undefined && input.text !== row.text) changes.text = input.text
  if (input.position !== undefined && input.position !== row.position) changes.position = input.position
  if (input.done !== undefined && input.done !== row.done) Object.assign(changes, doneColumns(ctx, input.done))
  return writeItem(ctx, row, changes)
}

/**
 * Marks an item (by id or 1-based display index) as done/undone. Idempotent: setting the current value is a
 * no-op that does not touch the task.
 */
export async function toggleChecklistItem(ctx: ServiceContext, ref: string, input: ToggleChecklistItemInput): Promise<ChecklistItemDto> {
  const item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'task.write', { projectId: item.project.id })
  let row: ChecklistItemRow | undefined
  if (input.itemId) {
    [row] = await ctx.db.select().from(taskChecklistItems)
      .where(and(eq(taskChecklistItems.id, input.itemId), eq(taskChecklistItems.taskId, item.task.id)))
      .limit(1)
  }
  else if (input.index !== undefined) {
    if (!Number.isInteger(input.index) || input.index < 1) throw new ServiceError('invalid', 'index must be a positive integer (1-based)')
    const rows = await ctx.db.select().from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, item.task.id))
      .orderBy(asc(taskChecklistItems.position), asc(taskChecklistItems.createdAt), asc(taskChecklistItems.id))
    row = rows[input.index - 1]
  }
  else {
    throw new ServiceError('invalid', 'Provide itemId or index')
  }
  if (!row) throw new ServiceError('not_found', 'Checklist item not found')
  if (row.done === input.done) return toChecklistItemDto(row)
  return writeItem(ctx, row, doneColumns(ctx, input.done))
}

export async function deleteChecklistItem(ctx: ServiceContext, itemId: string): Promise<void> {
  const { row } = await loadWritableItem(ctx, itemId)
  await ctx.db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, row.id))
  await touchTask(ctx, row.taskId)
}
