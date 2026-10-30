// Shared plumbing for services. Services are plain functions `(ctx, input)` with explicit (relative)
// imports — no Nitro auto-imports — so the REST API, the MCP server, scripts and tests can all call them.

import type { Db } from '../db'
import type { Actor, Action, PermissionContext } from '../../shared/utils/permissions'
import { can } from '../../shared/utils/permissions'

export interface ServiceContext {
  db: Db
  actor: Actor
  /** Base64 AES-256 key for the vault. Only needed by vault operations. */
  vaultKey?: string
  /** Public base URL (used to build share-link URLs). */
  siteUrl: string
  /** Injectable clock for tests. */
  now?: () => Date
}

export type ServiceErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'invalid'

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 422,
}

/**
 * Domain error. REST maps it to an HTTP error (`statusCode` + `data`), MCP to an `isError` tool result.
 * For version conflicts `details` carries the current DTO (see `ConflictDto`).
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ServiceErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}

export function nowOf(ctx: ServiceContext): Date {
  return ctx.now ? ctx.now() : new Date()
}

/** Throws `forbidden` unless the actor may perform the action. */
export function assertCan(ctx: ServiceContext, action: Action, permissionCtx: PermissionContext = {}): void {
  if (!can(ctx.actor, action, permissionCtx)) {
    throw new ServiceError('forbidden', `Not allowed: ${action}`)
  }
}

/** Value stored in created_by / updated_by columns. */
export function actorSource(ctx: ServiceContext): string {
  return ctx.actor.source
}
