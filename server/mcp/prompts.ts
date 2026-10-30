// MCP prompts, exposed by Claude Code as /mcp__task-manager__next-task and /mcp__task-manager__wrap-up.

import type { GetPromptResult, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

function userPrompt(text: string): GetPromptResult {
  return { messages: [{ role: 'user', content: { type: 'text', text } }] }
}

export function nextTaskPrompt(project?: string): GetPromptResult {
  const target = project ? `project "${project}"` : 'the session default project'
  return userPrompt([
    `Pick up the next task of ${target} in Task Manager and start it:`,
    `1. Call get_context${project ? ` with project "${project}"` : ''}.`,
    '2. If a task is already "in_progress", continue with it unless it is clearly not yours to do. Otherwise choose '
    + 'the top task of "nextUp" (highest priority, then earliest due date) that is not blocked and that you can do '
    + '(executor "ai" or "mixed").',
    '3. Read it with get_task, then set_status "in_progress" passing its version as expectedVersion.',
    '4. Outline a short plan. If the task has no checklist and the work has several steps, add them with '
    + 'add_checklist_items.',
    '5. Tell me the key, title and plan, and ask before anything risky or ambiguous.',
  ].join('\n'))
}

export function wrapUpPrompt(ref?: string): GetPromptResult {
  const target = ref ? `task ${ref}` : 'the task(s) you worked on in this session (those you set in_progress)'
  return userPrompt([
    `Wrap up ${target} in Task Manager:`,
    '1. Re-read each task with get_task.',
    '2. Tick the checklist items you completed (toggle_checklist_item) and add any remaining steps you discovered.',
    '3. add_comment with a concise summary of this session: what was done, files changed, commits, decisions, '
    + 'open questions and next steps. Never include secrets.',
    '4. Set the status: "done" if fully finished, "in_review" if I should check it, "blocked" with a blocker if '
    + 'waiting on someone, or keep "in_progress" if work remains.',
    '5. If you found follow-up work or ideas, create tasks for them (type "idea" when unsure) instead of doing them now.',
    '6. Reply with a short recap listing the task keys and their new status.',
  ].join('\n'))
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt('next-task', {
    title: 'Next task',
    description: 'Pick the next todo task of the project (priority, due date), set it in progress and outline a plan.',
    argsSchema: z.object({
      project: z.string().optional().describe('Project slug; default: the session project.'),
    }),
  }, ({ project }) => nextTaskPrompt(project?.trim() || undefined))

  server.registerPrompt('wrap-up', {
    title: 'Wrap up',
    description: 'Sync status, checklist and a summary comment for the work done in this session.',
    argsSchema: z.object({
      ref: z.string().optional().describe('Task key (e.g. ABC-12); default: the tasks worked on in this session.'),
    }),
  }, ({ ref }) => wrapUpPrompt(ref?.trim() || undefined))
}
