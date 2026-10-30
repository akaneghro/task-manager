// Client-side form checks reuse the shared zod schemas, whose messages are English: show translated text instead.

/** Name of the first field that failed (top-level path segment), or null. */
export function firstIssueField(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string | null {
  const field = issues[0]?.path[0]
  return typeof field === 'string' ? field : null
}
