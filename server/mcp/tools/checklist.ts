// Checklist, comment and dependency tools: add_checklist_items, toggle_checklist_item, add_comment, link_tasks.

import { z } from 'zod'
import { addChecklistItems, toggleChecklistItem } from '../../services/checklist'
import { addComment } from '../../services/comments'
import { addBlockedBy, removeBlockedBy } from '../../services/taskLinks'
import { getTask } from '../../services/tasks'
import { ServiceError, isServiceError } from '../../services/context'
import type { TaskDetailDto } from '../../../shared/types/dto'
import { jsonResult, runTool } from '../result'
import { IDEMPOTENT_WRITE, WRITE, taskRefParam } from './common'
import type { ToolRegistrar } from './common'
import { compactChecklist } from './format'

function compactDependencies(task: TaskDetailDto) {
  return {
    key: task.key,
    version: task.version,
    blockedBy: task.blockedBy.map(l => ({ key: l.key, title: l.title, status: l.status })),
    blocking: task.blocking.length > 0 ? task.blocking.map(l => ({ key: l.key, title: l.title, status: l.status })) : undefined,
  }
}

export const registerChecklistTools: ToolRegistrar = (server, ctx) => {
  server.registerTool('add_checklist_items', {
    title: 'Add checklist items',
    description: 'Appends items to a task\'s checklist (does not change the task version). Returns the full '
      + 'checklist with 1-based indexes and ids.',
    inputSchema: z.object({
      ref: taskRefParam,
      items: z.array(z.string().trim().min(1).max(500)).min(1).max(50).describe('Item texts, in order.'),
    }),
    annotations: WRITE,
  }, ({ ref, items }) => runTool(async () => {
    const checklist = await addChecklistItems(ctx, ref, items)
    return jsonResult({ ref, checklist: compactChecklist(checklist) })
  }))

  server.registerTool('toggle_checklist_item', {
    title: 'Tick checklist item',
    description: 'Marks a checklist item done (or not done) as you complete each step. Identify it by itemId or by '
      + 'its 1-based index from get_task. Idempotent: setting the current value changes nothing.',
    inputSchema: z.object({
      ref: taskRefParam,
      itemId: z.string().uuid().optional().describe('Checklist item id (from get_task).'),
      index: z.number().int().min(1).optional().describe('1-based position in the checklist (used when itemId is omitted).'),
      done: z.boolean().describe('true = done, false = not done.'),
    }),
    annotations: IDEMPOTENT_WRITE,
  }, ({ ref, itemId, index, done }) => runTool(async () => {
    if (itemId === undefined && index === undefined) throw new ServiceError('invalid', 'Provide itemId or index')
    const item = await toggleChecklistItem(ctx, ref, { itemId, index, done })
    return jsonResult({ ref, item: { id: item.id, text: item.text, done: item.done } })
  }))

  server.registerTool('add_comment', {
    title: 'Add comment',
    description: 'Adds a markdown comment to a task. At the end of a work session summarise what you did: files '
      + 'changed, commits, decisions, open questions. Never include secrets.',
    inputSchema: z.object({
      ref: taskRefParam,
      body: z.string().trim().min(1).max(20_000).describe('Markdown comment.'),
    }),
    annotations: WRITE,
  }, ({ ref, body }) => runTool(async () => {
    const comment = await addComment(ctx, ref, body)
    return jsonResult({ ref, commentId: comment.id, createdAt: comment.createdAt })
  }))

  server.registerTool('link_tasks', {
    title: 'Link task dependencies',
    description: 'Records that task "ref" is blocked by other task(s) (they must be finished first), across projects '
      + 'too. With remove=true the links are removed instead. Self links and dependency cycles are rejected; existing '
      + 'links are kept as is.',
    inputSchema: z.object({
      ref: taskRefParam.describe('The task that is blocked.'),
      blockedBy: z.union([taskRefParam, z.array(taskRefParam).min(1).max(20)])
        .describe('Key (or list of keys) of the blocking task(s).'),
      remove: z.boolean().optional().describe('true removes the links instead of adding them.'),
    }),
    annotations: WRITE,
  }, ({ ref, blockedBy, remove }) => runTool(async () => {
    const refs = Array.isArray(blockedBy) ? blockedBy : [blockedBy]
    const applied: string[] = []
    let task: TaskDetailDto | null = null
    for (const blocker of refs) {
      try {
        task = remove ? await removeBlockedBy(ctx, ref, blocker) : await addBlockedBy(ctx, ref, blocker)
        applied.push(blocker)
      }
      catch (error) {
        if (applied.length > 0 && isServiceError(error)) {
          throw new ServiceError(error.code, `${error.message} (already applied: ${applied.join(', ')})`, error.details)
        }
        throw error
      }
    }
    return jsonResult(compactDependencies(task ?? await getTask(ctx, ref)))
  }))
}
