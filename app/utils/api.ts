// Thin typed wrapper around $fetch + helpers to read REST errors (`{ statusCode, data: { code, message, details } }`).

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiOptions {
  method?: ApiMethod
  body?: Record<string, unknown>
  query?: Record<string, string | number | boolean | null | undefined>
}

/** `$fetch` with an explicit response type. Use for client-side mutations; prefer useFetch for page data. */
export function apiFetch<T>(url: string, options: ApiOptions = {}): Promise<T> {
  return $fetch<T>(url, {
    method: options.method ?? 'GET',
    body: options.body,
    query: options.query,
  }) as Promise<T>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** The `{ code, message, details }` payload of a service error, when present. */
function servicePayload(err: unknown): Record<string, unknown> | null {
  if (!isRecord(err)) return null
  const body = err.data
  if (!isRecord(body)) return null
  // ofetch FetchError: err.data = response body = { statusCode, message, data: { code, message, details } }
  if (isRecord(body.data) && ('code' in body.data || 'message' in body.data)) return body.data
  // NuxtError / createError on the client: err.data = { code, message, details }
  if ('code' in body) return body
  return null
}

/** HTTP status of a $fetch / useFetch error, or null. */
export function getErrorStatus(err: unknown): number | null {
  if (!isRecord(err)) return null
  for (const key of ['statusCode', 'status'] as const) {
    const value = err[key]
    if (typeof value === 'number') return value
  }
  if (isRecord(err.response) && typeof err.response.status === 'number') return err.response.status
  return null
}

/** Service error code (`conflict`, `not_found`, `forbidden`...), or null. */
export function getErrorCode(err: unknown): string | null {
  return nonEmptyString(servicePayload(err)?.code)
}

/** Service error details (e.g. the current DTO of a 409 conflict), or undefined. */
export function getErrorDetails(err: unknown): unknown {
  return servicePayload(err)?.details
}

/** Best human-readable message of an API error, or null when there is none. */
export function getErrorMessage(err: unknown): string | null {
  const payloadMessage = nonEmptyString(servicePayload(err)?.message)
  if (payloadMessage) return payloadMessage
  if (!isRecord(err)) return nonEmptyString(err)
  if (isRecord(err.data)) {
    const bodyMessage = nonEmptyString(err.data.message) ?? nonEmptyString(err.data.statusMessage)
    if (bodyMessage) return bodyMessage
  }
  return nonEmptyString(err.statusMessage) ?? nonEmptyString(err.message)
}

/** Whether the error is an optimistic-concurrency conflict (HTTP 409). */
export function isConflictError(err: unknown): boolean {
  return getErrorStatus(err) === 409 || getErrorCode(err) === 'conflict'
}

export interface SessionUserLike {
  id: string | null
  login: string
  name: string | null
  avatarUrl: string | null
  role: string | null
}

/** Defensive read of the nuxt-auth-utils session user (`{ id, login, name, avatarUrl, role }`). */
export function toSessionUser(raw: unknown): SessionUserLike | null {
  if (!isRecord(raw)) return null
  const login = nonEmptyString(raw.login) ?? nonEmptyString(raw.githubLogin)
  if (!login) return null
  return {
    id: nonEmptyString(raw.id),
    login,
    name: nonEmptyString(raw.name),
    avatarUrl: nonEmptyString(raw.avatarUrl),
    role: nonEmptyString(raw.role),
  }
}
