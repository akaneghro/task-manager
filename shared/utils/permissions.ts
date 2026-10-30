// Pure authorization matrix shared by the REST API, the MCP server and the UI.
// Server code is the only enforcement point; the UI uses it just to hide controls.

import type { MemberRole } from './enums'

export type Actor
  = | { kind: 'owner', userId: string, source: string }
    | { kind: 'member', userId: string, source: string, memberships: Readonly<Record<string, MemberRole>> }
    | { kind: 'public', projectId: string, shareLinkId: string, source: string }
    | {
      kind: 'mcp'
      userId: string
      tokenId: string
      tokenName: string
      allowSecrets: boolean
      /** Default project slug sent by the session (`X-TM-Project` header). */
      defaultProject: string | null
      source: string
    }

export type ActorKind = Actor['kind']

export const ACTIONS = [
  'project.list', // see the list of projects (filtered by visibility)
  'project.read', // see a project, its tasks, checklist and dependencies
  'project.readNotes', // see notes, links and client
  'project.create',
  'project.update', // name, slug, status, description, client, color
  'project.updateNotes', // notes + links
  'project.delete', // soft delete / archive
  'project.manage', // members, share links
  'task.read',
  'task.write', // create / edit / move tasks, checklist, dependencies
  'task.delete',
  'comment.read',
  'comment.write',
  'comment.moderate', // edit/delete comments written by others
  'vault.read', // account metadata
  'vault.write',
  'vault.reveal', // decrypt a secret in the UI
  'secret.readShared', // MCP: read secrets flagged "share with Claude"
  'token.manage',
] as const
export type Action = (typeof ACTIONS)[number]

export interface PermissionContext {
  /** Project the action targets. Required for project-scoped actions of members and public links. */
  projectId?: string
}

const COMMENTER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'project.list', 'project.read', 'project.readNotes', 'task.read', 'comment.read', 'comment.write',
])
const VIEWER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'project.list', 'project.read', 'project.readNotes', 'task.read', 'comment.read',
])
const PUBLIC_ACTIONS: ReadonlySet<Action> = new Set<Action>(['project.read', 'task.read'])
const MCP_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'project.list', 'project.read', 'project.readNotes', 'project.create', 'project.updateNotes',
  'task.read', 'task.write', 'comment.read', 'comment.write',
])

/** Actions that do not target a single project. */
const GLOBAL_ACTIONS: ReadonlySet<Action> = new Set<Action>(['project.list', 'project.create', 'token.manage'])

export function memberRoleIn(actor: Actor, projectId: string | undefined): MemberRole | null {
  if (actor.kind !== 'member' || !projectId) return null
  return actor.memberships[projectId] ?? null
}

export function can(actor: Actor, action: Action, ctx: PermissionContext = {}): boolean {
  switch (actor.kind) {
    case 'owner':
      return true
    case 'member': {
      if (action === 'project.list') return true
      if (GLOBAL_ACTIONS.has(action)) return false
      const role = memberRoleIn(actor, ctx.projectId)
      if (!role) return false
      return (role === 'commenter' ? COMMENTER_ACTIONS : VIEWER_ACTIONS).has(action)
    }
    case 'public':
      return ctx.projectId === actor.projectId && PUBLIC_ACTIONS.has(action)
    case 'mcp':
      if (action === 'secret.readShared') return actor.allowSecrets
      return MCP_ACTIONS.has(action)
  }
}

/** Whether the actor can see a project at all. */
export function canSeeProject(actor: Actor, projectId: string): boolean {
  return can(actor, 'project.read', { projectId })
}

/** Capabilities summary for the UI. */
export function projectCapabilities(actor: Actor, projectId: string) {
  return {
    edit: can(actor, 'task.write', { projectId }),
    comment: can(actor, 'comment.write', { projectId }),
    manage: can(actor, 'project.manage', { projectId }),
    vault: can(actor, 'vault.read', { projectId }),
  }
}
