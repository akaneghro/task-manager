// Turns $fetch / useFetch errors into user-facing messages (falls back to a translated generic message).

export function useApiError() {
  const { t } = useI18n()

  function message(err: unknown): string {
    const status = getErrorStatus(err)
    const code = getErrorCode(err)
    if (status === 409 || code === 'conflict') return t('errors.conflict')
    if (status === 401) return t('errors.unauthorized')
    const text = getErrorMessage(err)
    if (text && !/^\[(?:GET|POST|PUT|PATCH|DELETE)\]/.test(text) && text !== 'Validation Error') return text
    if (status === 400 || status === 422) return t('errors.validation')
    if (status === 403) return t('errors.forbidden')
    if (status === 404) return t('errors.notFound')
    return t('errors.generic')
  }

  return {
    message,
    status: getErrorStatus,
    code: getErrorCode,
    details: getErrorDetails,
    isConflict: isConflictError,
  }
}
