// Project tools: get_context, list_projects, get_project, create_project, update_project_notes, update_project_links.

import { z } from 'zod'
import { PROJECT_LINK_KINDS, PROJECT_STATUSES } from '../../../shared/utils/enums'
import { projectKeySchema, slugSchema, urlSchema } from '../../../shared/schemas/common'
import type { ProjectLinkInput } from '../../../shared/schemas/project'
import { isServiceError } from '../../services/context'
import { createProject, getProject, listProjects, replaceProjectLinks, updateProjectNotes } from '../../services/projects'
import { getProjectContext } from '../../services/tasks'
import { jsonResult, runTool } from '../result'
import { READ_ONLY, WRITE, defaultProjectOf, projectParam, projectUrl, requireProject, resolveProjectArg } from './common'
import type { ToolRegistrar } from './common'
import { CONTEXT_NOTES_PREVIEW, compactProjectContext, compactProjectDetail, compactProjectSummary } from './format'

const linkParam = z.object({
  kind: z.enum(PROJECT_LINK_KINDS).optional().describe('Default "other".'),
  label: z.string().trim().min(1).max(80),
  url: urlSchema.describe('http(s) URL.'),
})

export const registerProjectTools: ToolRegistrar = (server, ctx) => {
  server.registerTool('get_context', {
    title: 'Get project context',
    description: 'Call this FIRST in every session. Returns a snapshot of the project this repository is linked to '
      + '(session default project, or "project" if given): status, links, the project notes (durable knowledge from '
      + `earlier sessions: setup steps, decisions, gotchas; the first ${CONTEXT_NOTES_PREVIEW} characters, `
      + '"notesTruncated" when there is more: then read get_project), task counts, and the tasks in progress, next up '
      + '(startable todo tasks, ai/mixed first), blocked and in review. If the session has no default project it '
      + 'returns the list of projects instead, with a hint. Use get_task for a task\'s details.',
    inputSchema: z.object({ project: projectParam.optional() }),
    annotations: READ_ONLY,
  }, ({ project }) => runTool(async () => {
    const actor = ctx.actor
    const session = actor.kind === 'mcp'
      ? { token: actor.tokenName, defaultProject: actor.defaultProject, secretsAllowed: actor.allowSecrets }
      : undefined
    const fallback = project ? null : defaultProjectOf(ctx)
    if (!project && !fallback) {
      const projects = await listProjects(ctx, {})
      return jsonResult({
        session,
        hint: 'This session has no default project (X-TM-Project header). Ask the user which project this repo belongs '
          + 'to, then pass "project" to the tools, or put quick captures in the Inbox (slug "inbox").',
        projects: projects.map(compactProjectSummary),
      })
    }
    let row
    if (project) {
      row = await resolveProjectArg(ctx, project)
    }
    else {
      const sessionSlug = fallback ?? ''
      row = await resolveProjectArg(ctx, sessionSlug, true).catch((error: unknown) => {
        if (isServiceError(error) && error.code === 'not_found') return null
        throw error
      })
      if (!row) {
        // The folder was connected before its project existed (`pnpm connect <folder>`): offer to create it.
        const projects = await listProjects(ctx, {})
        return jsonResult({
          session,
          missingProject: sessionSlug,
          hint: `This folder is connected to project "${sessionSlug}" (X-TM-Project header), but that project does not `
            + `exist yet. Offer the user to create it now with create_project using slug "${sessionSlug}" exactly (so `
            + 'this connection keeps working): ask for its status and client, propose a short name and a 2-6 letter key, '
            + 'and you may fill description/links from the repository. Until then, quick captures can go to the Inbox '
            + '(project "inbox").',
          projects: projects.map(compactProjectSummary),
        })
      }
    }
    const context = await getProjectContext(ctx, row.slug)
    return jsonResult({ session, ...compactProjectContext(context) }, { structured: true })
  }))

  server.registerTool('list_projects', {
    title: 'List projects',
    description: 'Lists the projects (Inbox first, then by status and name) with their slug, key and open task count. '
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
    description: 'Returns a project\'s details: description, status, client, links (repo, prod, docs...), the full '
      + 'markdown notes, task counts and "version" (needed by update_project_notes in replace mode). Never includes vault data.',
    inputSchema: z.object({ project: projectParam.optional() }),
    annotations: READ_ONLY,
  }, ({ project }) => runTool(async () => {
    const detail = await getProject(ctx, await requireProject(ctx, project))
    return jsonResult(compactProjectDetail(detail), { structured: true })
  }))

  server.registerTool('create_project', {
    title: 'Create project',
    description: 'Creates a new project. Only do this when the user asks for it (or accepts your offer when '
      + 'get_context reports "missingProject": then pass that exact value as "slug"). "key" is the 2-6 letter task key '
      + 'prefix (e.g. "RNK" -> tasks RNK-1, RNK-2...) and can never change. The slug is derived from the name when '
      + 'omitted ("inbox" and "all" are reserved).',
    inputSchema: z.object({
      name: z.string().trim().min(1).max(120).describe('Display name.'),
      key: projectKeySchema.describe('2-6 characters A-Z/0-9 starting with a letter, unique, immutable.'),
      slug: slugSchema.optional().describe('URL slug (lowercase, digits, dashes). Default: derived from the name.'),
      status: z.enum(PROJECT_STATUSES).optional().describe('Default "idea".'),
      description: z.string().max(5000).optional().describe('Short description (markdown).'),
      client: z.string().trim().max(120).optional().describe('Client name, if any.'),
      notes: z.string().max(200_000).optional().describe('Initial markdown notes.'),
      links: z.array(linkParam).max(30).optional().describe('Links (repo, prod, staging, docs, other).'),
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
    const detail = await updateProjectNotes(ctx, await requireProject(ctx, project), { mode, content, expectedVersion })
    return jsonResult({ slug: detail.slug, version: detail.version, notesLength: detail.notes.length })
  }))

  server.registerTool('update_project_links', {
    title: 'Add or update project links',
    description: 'Adds links to the project (repo, prod, staging, docs, other), e.g. a new staging URL. A link whose '
      + 'URL already exists gets its label/kind updated instead of being duplicated. Never removes links (the user '
      + 'does that in the web app). Returns the full list.',
    inputSchema: z.object({
      project: projectParam.optional(),
      links: z.array(linkParam).min(1).max(30).describe('Links to add or update (matched by URL).'),
    }),
    annotations: WRITE,
  }, ({ project, links }) => runTool(async () => {
    const slug = await requireProject(ctx, project)
    const current = (await getProject(ctx, slug)).links
    const merged: ProjectLinkInput[] = [...current]
      .sort((a, b) => a.position - b.position)
      .map(l => ({ kind: l.kind, label: l.label, url: l.url }))
    for (const link of links) {
      const next: ProjectLinkInput = { kind: link.kind ?? 'other', label: link.label, url: link.url }
      const index = merged.findIndex(l => l.url === link.url)
      if (index === -1) merged.push(next)
      else merged[index] = { ...next, kind: link.kind ?? merged[index]?.kind ?? 'other' }
    }
    const saved = await replaceProjectLinks(ctx, slug, merged)
    return jsonResult({ slug, links: saved.map(l => ({ kind: l.kind, label: l.label, url: l.url })) })
  }))
}
