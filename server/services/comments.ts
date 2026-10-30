// Task comments. Owner moderates everything, commenters edit their own, MCP writes but never edits/deletes.

import { eq } from 'drizzle-orm'
import { comments } from '../db/schema'
import { commentBodySchema } from '../../shared/schemas/task'
import { can } from '../../shared/utils/permissions'
import type { CommentDto } from '../../shared/types/dto'
import { ServiceError, assertCan, nowOf } from './context'
import type { ServiceContext } from './context'
import {
  canEditComment,
  insertComment,
  loadCommentById,
  loadComments,
  loadTaskWithProjectById,
  resolveTaskWithProject,
  toCommentDto,
  touchTask,
} from './taskMappers'
import type { CommentWithAuthor, TaskWithProject } from './taskMappers'

function parseBody(body: string): string {
  const result = commentBodySchema.safeParse({ body })
  if (!result.success) throw new ServiceError('invalid', result.error.issues.map(i => i.message).join('; '), result.error.issues)
  return result.data.body
}

export async function listComments(ctx: ServiceContext, ref: string): Promise<CommentDto[]> {
  const item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'comment.read', { projectId: item.project.id })
  return loadComments(ctx, item.task.id, item.project.id)
}

export async function addComment(ctx: ServiceContext, ref: string, body: string): Promise<CommentDto> {
  const item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'comment.write', { projectId: item.project.id })
  return insertComment(ctx, item, parseBody(body))
}

/** Loads a comment whose task and project are visible to the actor; `not_found` otherwise. */
async function loadEditableComment(ctx: ServiceContext, id: string): Promise<{ row: CommentWithAuthor, item: TaskWithProject }> {
  const row = await loadCommentById(ctx, id)
  const item = row ? await loadTaskWithProjectById(ctx.db, row.comment.taskId) : null
  if (!row || !item || item.task.deletedAt || !can(ctx.actor, 'comment.read', { projectId: item.project.id })) {
    throw new ServiceError('not_found', 'Comment not found')
  }
  if (!canEditComment(ctx, row.comment, item.project.id)) {
    throw new ServiceError('forbidden', 'Not allowed to modify this comment')
  }
  return { row, item }
}

export async function updateComment(ctx: ServiceContext, id: string, body: string): Promise<CommentDto> {
  const text = parseBody(body)
  const { row, item } = await loadEditableComment(ctx, id)
  const now = nowOf(ctx)
  await ctx.db.update(comments).set({ body: text, updatedAt: now }).where(eq(comments.id, id))
  await touchTask(ctx, item.task.id)
  return toCommentDto(ctx, { ...row, comment: { ...row.comment, body: text, updatedAt: now } }, item.project.id)
}

/** Soft delete. */
export async function deleteComment(ctx: ServiceContext, id: string): Promise<void> {
  const { item } = await loadEditableComment(ctx, id)
  const now = nowOf(ctx)
  await ctx.db.update(comments).set({ deletedAt: now, updatedAt: now }).where(eq(comments.id, id))
  await touchTask(ctx, item.task.id)
}
