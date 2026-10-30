// REST plumbing: ServiceError/ZodError -> HTTP errors, thin handler wrappers, input parsing and the CSRF origin
// check. Pure helpers are unit-tested; the wrappers use Nitro auto-imports.

import { z } from 'zod'
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import type { ConflictDto } from '../../shared/types/dto'
import { errorReason, isServiceError } from '../services/context'
import type { ServiceContext, ServiceErrorCode } from '../services/context'
import { requireActor, serviceContext } from './actor'

// ---------------------------------------------------------------------------------------------------------------
// Error mapping

export interface HttpErrorData {
  code: ServiceErrorCode
  message: string
  details?: unknown
  /** Version conflicts also carry the `ConflictDto` fields (`details` = `current`). */
  error?: ConflictDto<unknown>['error']
  current?: unknown
}

export interface HttpErrorInput {
  statusCode: number
  statusMessage: string
  message: string
  data: HttpErrorData
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
}

export interface ValidationIssue {
  path: string
  message: string
  code: string
}

export function validationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map(issue => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }))
}

function validationMessage(issues: readonly ValidationIssue[]): string {
  const first = issues[0]
  if (!first) return 'Invalid input'
  return first.path ? `Invalid input: ${first.path}: ${first.message}` : `Invalid input: ${first.message}`
}

/** HTTP error payload for a ServiceError or a ZodError; null for anything else. */
export function httpErrorInputOf(error: unknown): HttpErrorInput | null {
  if (isServiceError(error)) {
    const data: HttpErrorData = { code: error.code, message: error.message }
    if (error.details !== undefined) data.details = error.details
    if (error.code === 'conflict' && error.details !== undefined && error.details !== null && !errorReason(error.details)) {
      // Superset of ConflictDto so clients can read either `details` or `current`.
      data.error = 'version_conflict'
      data.current = error.details
    }
    return {
      statusCode: error.status,
      statusMessage: STATUS_TEXT[error.status] ?? 'Error',
      message: error.message,
      data,
    }
  }
  if (error instanceof z.ZodError) {
    const issues = validationIssues(error)
    const message = validationMessage(issues)
    return {
      statusCode: 422,
      statusMessage: STATUS_TEXT[422] ?? 'Unprocessable Entity',
      message,
      data: { code: 'invalid', message, details: issues },
    }
  }
  return null
}

/** Converts service/validation errors to H3 errors; any other error is returned unchanged (to be rethrown). */
export function toHttpError(error: unknown): Error {
  const input = httpErrorInputOf(error)
  if (input) return createError(input)
  return error instanceof Error ? error : new Error(String(error))
}

// ---------------------------------------------------------------------------------------------------------------
// Handlers

/** Event handler whose errors go through `toHttpError`. */
export function defineServiceHandler<T>(fn: (event: H3Event) => T | Promise<T>): EventHandler<EventHandlerRequest, Promise<T>> {
  return defineEventHandler(async (event): Promise<T> => {
    try {
      return await fn(event)
    }
    catch (error) {
      throw toHttpError(error)
    }
  })
}

/** Event handler for cookie-authenticated endpoints: resolves the session actor and builds the ServiceContext. */
export function defineSessionHandler<T>(fn: (event: H3Event, ctx: ServiceContext) => T | Promise<T>): EventHandler<EventHandlerRequest, Promise<T>> {
  return defineServiceHandler(async (event) => {
    const actor = await requireActor(event)
    return fn(event, serviceContext(event, actor))
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Input

/** JSON body parsed with a zod schema (an empty body counts as `{}`). Failures become 422 via `toHttpError`. */
export async function readBodyAs<S extends z.ZodType>(event: H3Event, schema: S): Promise<z.output<S>> {
  const body: unknown = await readBody(event)
  return schema.parse(body ?? {})
}

/** Query string parsed with a zod schema. Failures become 422 via `toHttpError`. */
export function queryAs<S extends z.ZodType>(event: H3Event, schema: S): z.output<S> {
  return schema.parse(getQuery(event))
}

/** Required route parameter (decoded). */
export function routeParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name, { decode: true })?.trim()
  if (!value) {
    const message = `Missing route parameter: ${name}`
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message, data: { code: 'invalid', message } })
  }
  return value
}

// ---------------------------------------------------------------------------------------------------------------
// CSRF

export type HeaderBag = Readonly<Record<string, string | string[] | undefined>>

function firstHeader(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function hostOfUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.host.toLowerCase()
  }
  catch {
    return null
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:(80|443)$/, '')
}

/**
 * Whether the `Origin` (or, without it, `Referer`) of a request points to this site: the request host or the
 * host of the configured public site URL. Missing or opaque (`null`) origins are rejected.
 */
export function isSameOriginRequest(headers: HeaderBag, host: string, siteUrl: string): boolean {
  const source = firstHeader(headers.origin) ?? firstHeader(headers.referer)
  if (!source || source === 'null') return false
  const sourceHost = hostOfUrl(source)
  if (!sourceHost) return false
  const allowed = new Set<string>()
  if (host.trim()) allowed.add(normalizeHost(host))
  const siteHost = siteUrl ? hostOfUrl(siteUrl) : null
  if (siteHost) allowed.add(siteHost)
  return allowed.has(normalizeHost(sourceHost))
}

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Whether a request must pass the CSRF origin check: every state-changing /api/** request. Deliberately ignores
 * request headers (an `Authorization` header is no exemption, every /api write authenticates from the cookie).
 */
export function needsCsrfCheck(method: string, path: string): boolean {
  const normalized = path.toLowerCase().replace(/\/{2,}/g, '/')
  return normalized.startsWith('/api/') && !CSRF_SAFE_METHODS.has(method.toUpperCase())
}
