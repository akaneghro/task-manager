// Pure helpers to make sure a path is listed in a .gitignore (tested).

export interface TextChange {
  text: string
  changed: boolean
}

/** Line ending used by `text` (CRLF when any CRLF is present, LF otherwise). */
export function detectEol(text: string | null | undefined): '\r\n' | '\n' {
  return text?.includes('\r\n') ? '\r\n' : '\n'
}

/** Normalises a gitignore pattern for comparison (`/.mcp.json`, `**\/.mcp.json`, `.mcp.json  ` -> `.mcp.json`). */
function normalisePattern(pattern: string): string {
  let p = pattern.replace(/(?<!\\)\s+$/, '')
  if (p.startsWith('**/')) p = p.slice(3)
  if (p.startsWith('/')) p = p.slice(1)
  return p
}

/**
 * Returns `true` when the last rule of `text` matching `entry` ignores it (a later `!entry` re-includes it).
 * Only exact equivalents are recognised (`entry`, `/entry`, `**\/entry`), not wildcards like `*.json`.
 */
export function isIgnoredBy(text: string, entry: string): boolean {
  const target = normalisePattern(entry)
  let ignored = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimStart()
    if (line === '' || line.startsWith('#')) continue
    const negated = line.startsWith('!')
    if (normalisePattern(negated ? line.slice(1) : line) === target) ignored = !negated
  }
  return ignored
}

/**
 * Ensures `entry` is ignored by the given .gitignore content (`null` = the file does not exist).
 * Keeps the file's line endings, adds the missing final newline before appending, never duplicates.
 */
export function ensureGitignoreEntry(text: string | null, entry: string): TextChange {
  const line = entry.trim()
  if (!line) throw new Error('entry must not be empty')
  if (text === null || text === '') return { text: `${line}\n`, changed: true }
  if (isIgnoredBy(text, line)) return { text, changed: false }
  const eol = detectEol(text)
  const separator = text.endsWith('\n') ? '' : eol
  return { text: `${text}${separator}${line}${eol}`, changed: true }
}
