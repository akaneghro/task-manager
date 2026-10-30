// MCP identity: bearer token -> Actor, and the AuthInfo envelope the HTTP route hands to the SDK handler.

import type { AuthInfo } from '@modelcontextprotocol/server'
import type { Actor } from '../../shared/utils/permissions'
import { slugSchema } from '../../shared/schemas/common'

export interface McpTokenIdentity {
  tokenId: string
  tokenName: string
  userId: string
  allowSecrets: boolean
}

/** Builds the MCP actor of an authenticated API token. `defaultProject` comes from `X-TM-Project` / `?project=`. */
export function mcpActorFromToken(token: McpTokenIdentity, defaultProject: string | null): Actor {
  return {
    kind: 'mcp',
    userId: token.userId,
    tokenId: token.tokenId,
    tokenName: token.tokenName,
    allowSecrets: token.allowSecrets,
    defaultProject,
    source: `mcp:${token.tokenName}`,
  }
}

/** The trimmed, non-empty default-project value sent in a header/query (first one if repeated), else null. */
export function rawDefaultProject(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

/**
 * Normalises a default-project slug from a header/query value; null when empty or not a valid slug. The route
 * answers 400 when a value was sent but is invalid (see `rawDefaultProject`).
 */
export function parseDefaultProject(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const result = slugSchema.safeParse(raw)
  return result.success ? result.data : null
}

/**
 * AuthInfo passed to `createMcpHandler(...).fetch()`. `token` carries the token id (never the plain token) and
 * `extra` the identity + default project the server factory turns back into an actor.
 */
export function mcpAuthInfo(token: McpTokenIdentity, defaultProject: string | null): AuthInfo {
  return {
    token: token.tokenId,
    clientId: token.tokenName,
    scopes: token.allowSecrets ? ['tasks', 'secrets'] : ['tasks'],
    extra: {
      tokenId: token.tokenId,
      tokenName: token.tokenName,
      userId: token.userId,
      allowSecrets: token.allowSecrets,
      defaultProject,
    },
  }
}

/** Inverse of `mcpAuthInfo`: returns the actor, or null when the AuthInfo is missing or malformed. */
export function mcpActorFromAuthInfo(authInfo: AuthInfo | undefined): Actor | null {
  const extra: unknown = authInfo?.extra
  if (typeof extra !== 'object' || extra === null) return null
  const { tokenId, tokenName, userId, allowSecrets, defaultProject } = extra as Record<string, unknown>
  if (typeof tokenId !== 'string' || typeof tokenName !== 'string' || typeof userId !== 'string') return null
  return mcpActorFromToken(
    { tokenId, tokenName, userId, allowSecrets: allowSecrets === true },
    typeof defaultProject === 'string' ? parseDefaultProject(defaultProject) : null,
  )
}
