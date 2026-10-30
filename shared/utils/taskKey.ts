// Human friendly task keys such as `RNK-12` (project key + per-project number).

const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,5}$/
const TASK_KEY_RE = /^([A-Z][A-Z0-9]{1,5})-(\d{1,9})$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ParsedTaskKey {
  projectKey: string
  number: number
}

export function isValidProjectKey(key: string): boolean {
  return PROJECT_KEY_RE.test(key)
}

export function formatTaskKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`
}

/** Parses `rnk-12` / `RNK-12` (case-insensitive). Returns null when the input is not a task key. */
export function parseTaskKey(input: string): ParsedTaskKey | null {
  const match = TASK_KEY_RE.exec(input.trim().toUpperCase())
  if (!match?.[1] || !match[2]) return null
  const number = Number.parseInt(match[2], 10)
  if (!Number.isSafeInteger(number) || number < 1) return null
  return { projectKey: match[1], number }
}

export function isUuid(input: string): boolean {
  return UUID_RE.test(input)
}

/** Suggests a project key from a name: "Renkia Web" -> "RW", "renkia" -> "REN". */
export function suggestProjectKey(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'PRJ'
  const candidate = words.length === 1
    ? (words[0] ?? '').slice(0, 3)
    : words.map(w => w[0]).join('').slice(0, 6)
  const key = /^[A-Z]/.test(candidate) ? candidate : `P${candidate}`.slice(0, 6)
  return key.length >= 2 ? key : `${key}X`
}

/** Builds a URL-safe slug: "Renkia Web App!" -> "renkia-web-app". */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
