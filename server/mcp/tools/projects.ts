// Project tools: get_context, list_projects, get_project, create_project, update_project_notes.

import { z } from 'zod'
import { PROJECT_STATUSES } from '../../../shared/utils/enums'
import { projectKeySchema, slugSchema } from '../../../shared/schemas/common'
import { createProject, getProject, listProjects, updateProjectNotes } from '../../services/projects'
import { getProjectContext } from '../../services/tasks'
import { isServiceError, ServiceError } from '../../services/context'
import { jsonResult, runTool } from '../result'
import { READ_ONLY, WRITE, defaultProjectOf, projectParam, projectUrl, requireProject } from './common'
import type { ToolRegistrar } from './common'
import { compactProjectContext, compactProjectDetail, compactProjectSummary } from './format'

export const registerProjectTools: ToolRegistrar = (server, ctx) => {
  server.registerTool('get_context', {
    title: 'Get project context',
    description: 'Call this FIRST in every session. Returns a snapshot of the project this repository is linked to '
      + '(session default project, or "project" if given): status, task counts, and the tasks in progress, next up '
      + '(top todo by priority/due date), blocked and in review. If the session has no default project it returns the '
      + 'list of projects instead, with a hint. Use get_project for notes/links and get_task for a task\'s details.',
    inputSchema: z.object({ project: projectParam.optional() }),
    annotations: READ_ONLY,
  }, ({ project }) => runTool(async () => {
    const actor = ctx.actor
    const session = actor.kind === 'mcp'
      ? { token: actor.tokenName, defaultProject: actor.defaultProject, secretsAllowed: actor.allowSecrets }
      : undefined
    const slug = project ?? defaultProjectOf(ctx)
    if (!slug) {
      const projects = await listProjects(ctx, {})
      return jsonResult({
        session,
        hint: 'This session has no default project (X-TM-Project header). Ask the user which project this repo belongs '
          + 'to, then pass "project" to the tools, or put quick captures in the Inbox (slug "inbox").',
        projects: projects.map(compactProjectSummary),
      })
    }
    try {
      const context = await getProjectContext(ctx, slug)
      return jsonResult({ session, ...compactProjectContext(context) }, { structured: true })
    }
    catch (error) {
      if (isServiceError(error) && error.code === 'not_found' && !project) {
        throw new ServiceError('not_found', `The session default project "${slug}" (X-TM-Project header) does not exist. `
          + 'Use list_projects to find the right slug, or create_project if the user wants one')
      }
      throw error
    }
  }))

  server.registerTool('list_projects', {
    title: 'List projects',
    description: 'Lists the projects (Inbox first, then by status and name) with their open task count. '
      + 'Archived projects are hidden unless includeArchived is true or "archived" is in status.',
    inputSchema: z.object({
      status: z.array(z.enum(PROJECT_STATUSES)).optional().describe('Only projects with these statuses.'),
      includeArchived: z.boolean().optional().describe('Include archived projects (default false).'),
    }),
    annotations: READ_ONLY,
  }, ({ status, includeArchived }) => runTool(async () => {
    const projects = await listProjects(ctx, { status, includeArchived })
    return jsonResult({ projects: projects.map(compactProjectSummary) })
  }))

  server.registerTool('get_project', {
    title: 'Get project',
    description: 'Returns a project\'s details: description, status, client, links (repo, prod, docs...), markdown '
      + 'notes, task counts and "version" (needed by update_project_notes in replace mode). Never includes vault data.',
    inputSchema: z.object({ project: projectParam.optional() }),
    annotations: READ_ONLY,
  }, ({ project }) => runTool(async () => {
    const detail = await getProject(ctx, requireProject(ctx, project))
    return jsonResult(compactProjectDetail(detail), { structured: true })
  }))

  server.registerTool('create_project', {
    title: 'Create project',
    description: 'Creates a new project. Only do this when the user asks for it. "key" is the 2-6 letter task key '
      + 'prefix (e.g. "RNK" -> tasks RNK-1, RNK-2...) and can never change. The slug is derived from the name when omitted.',
    inputSchema: z.object({
      name: z.string().trim().min(1).max(120).describe('Display name.'),
      key: projectKeySchema.describe('2-6 characters A-Z/0-9 starting with a letter, unique, immutable.'),
      slug: slugSchema.optional().describe('URL slug (lowercase, digits, dashes). Default: derived from the name.'),
      status: z.enum(PROJECT_STATUSES).optional().describe('Default "idea".'),
      description: z.string().max(5000).optional().describe('Short description (markdown).'),
      client: z.string().trim().max(120).optional().describe('Client name, if any.'),
    }),
    annotations: WRITE,
  }, input => runTool(async () => {
    const detail = await createProject(ctx, input)
    return jsonResult({
      slug: detail.slug,
      key: detail.key,
      name: detail.name,
      status: detail.status,
      version: detail.version,
      url: projectUrl(ctx, detail.slug),
    }, { structured: true })
  }))

  server.registerTool('update_project_notes', {
    title: 'Update project notes',
    description: 'Edits the project\'s markdown notes (decisions, setup steps, credentials locations...). Prefer '
      + 'mode "append" (adds a paragraph at the end, never overwrites the user\'s text). Mode "replace" rewrites the '
      + 'whole notes and requires expectedVersion = the project "version" from get_project; on a conflict re-read and merge.',
    inputSchema: z.object({
      project: projectParam.optional(),
      mode: z.enum(['append', 'replace']).describe('"append" (safe) or "replace" (needs expectedVersion).'),
      content: z.string().max(200_000).describe('Markdown to append, or the full new notes for "replace".'),
      expectedVersion: z.number().int().positive().optional().describe('Project version from get_project (required for "replace").'),
    }),
    annotations: WRITE,
  }, ({ project, mode, content, expectedVersion }) => runTool(async () => {
    const detail = await updateProjectNotes(ctx, requireProject(ctx, project), { mode, content, expectedVersion })
    return jsonResult({ slug: detail.slug, version: detail.version, notesLength: detail.notes.length })
  }))
}
