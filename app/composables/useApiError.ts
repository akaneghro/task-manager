// Turns $fetch / useFetch errors into user-facing, translated messages.
// Server messages are English (they are also read by MCP clients): the UI shows them only as a last resort.

/** Stable `details.reason` of a ServiceError (see server/services/context.ts `because`), or null. */
export function getErrorReason(err: unknown): string | null {
  const details = getErrorDetails(err)
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return null
  const reason = (details as { reason?: unknown }).reason
  return typeof reason === 'string' && /^[a-z_]+$/.test(reason) ? reason : null
}

export function useApiError() {
  const { t, te } = useI18n()

  function message(err: unknown): string {
    const reason = getErrorReason(err)
    if (reason && te(`errors.reasons.${reason}`)) return t(`errors.reasons.${reason}`)
    const status = getErrorStatus(err)
    const code = getErrorCode(err)
    if (status === 409 || code === 'conflict') return t('errors.conflict')
    if (status === 401 || code === 'unauthorized') return t('errors.unauthorized')
    if (status === 403 || code === 'forbidden') return t('errors.forbidden')
    if (status === 404 || code === 'not_found') return t('errors.notFound')
    if (status === 400 || status === 422 || code === 'invalid') return t('errors.validation')
    if (status === 429) return t('errors.rateLimited')
    // Unknown errors: the server text when it is meaningful, else a generic message.
    const text = getErrorMessage(err)
    if (text && !/^\[(?:GET|POST|PUT|PATCH|DELETE)\]/.test(text) && text !== 'Validation Error' && !/fetch/i.test(text)) return text
    return t('errors.generic')
  }

  return {
    message,
    status: getErrorStatus,
    code: getErrorCode,
    reason: getErrorReason,
    details: getErrorDetails,
    /** A version conflict (409 carrying the current state), not a "name already taken" kind of conflict. */
    isConflict: (err: unknown) => isConflictError(err) && getErrorReason(err) === null,
  }
}
