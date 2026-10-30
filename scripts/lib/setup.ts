// Helpers for the first-run wizard `pnpm run setup` (pure except the key generator, tested).
// Never prints or returns existing values: callers only see key names.

import { generateSessionPassword, generateVaultKey } from '../../server/utils/crypto'
import { ArgsError, parseArgs } from './args'
import { detectEol } from './gitignore'

/** Local env filename, built at runtime on purpose (see CLAUDE.md security rules). */
export const ENV_FILE = ['.', 'env'].join('')
export const ENV_EXAMPLE_FILE = `${ENV_FILE}.example`

export const GITHUB_OAUTH_APP = {
  newAppUrl: 'https://github.com/settings/applications/new',
  homepageUrl: 'http://localhost:3000',
  callbackUrl: 'http://localhost:3000/auth/github',
} as const

/** Variables the app cannot run without (a GitHub login needs all of them). */
export const REQUIRED_ENV_KEYS = [
  'NUXT_SESSION_PASSWORD',
  'NUXT_VAULT_KEY',
  'NUXT_OAUTH_GITHUB_CLIENT_ID',
  'NUXT_OAUTH_GITHUB_CLIENT_SECRET',
  'NUXT_OWNER_GITHUB_LOGIN',
] as const

export const VAULT_KEY_WARNING = [
  'WARNING: keep NUXT_VAULT_KEY safe (e.g. in your password manager).',
  '  Vault secrets are encrypted with it: if you lose or change it, every stored secret becomes unrecoverable.',
  '  Changing NUXT_SESSION_PASSWORD only logs everybody out.',
].join('\n')

/** Fresh `NUXT_SESSION_PASSWORD` and `NUXT_VAULT_KEY`. */
export function generateEnvSecrets(): { NUXT_SESSION_PASSWORD: string, NUXT_VAULT_KEY: string } {
  return { NUXT_SESSION_PASSWORD: generateSessionPassword(), NUXT_VAULT_KEY: generateVaultKey() }
}

export interface SetupOptions {
  clientId?: string
  clientSecret?: string
  login?: string
  /** Never ask: keep an existing env file (unless --force) and leave missing values empty. */
  yes: boolean
  /** Overwrite an existing env file (the old one is backed up). */
  force: boolean
  /** Hidden: write the env file and the local database under this folder instead of the repo (testing). */
  dir?: string
  help: boolean
}

export const SETUP_USAGE = `Usage: pnpm run setup [options]

First-run wizard: creates the local env file from .env.example with fresh
secrets and your GitHub OAuth App, then creates the local database and the Inbox.
(Plain "pnpm setup" is a built-in pnpm command: use "pnpm run setup".)

Options:
  --client-id <id>          GitHub OAuth App client ID
  --client-secret <secret>  GitHub OAuth App client secret (prefer the hidden prompt:
                            flags end up in your shell history)
  --login <username>        Your GitHub username (the owner of this instance)
  -y, --yes                 Do not ask anything: keep an existing env file (flags given
                            are still written to it) and leave values not given empty
  --force                   Recreate an existing env file (a backup is kept)
  -h, --help                Show this help`

const GITHUB_LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const OAUTH_VALUE_RE = /^[\w.-]{8,128}$/

/** GitHub username rules: 1-39 letters, digits or single inner dashes. */
export function isGithubLogin(value: string): boolean {
  return GITHUB_LOGIN_RE.test(value)
}

/** Loose check for an OAuth App client ID / secret (`Ov23li...`, `Iv1.abc...`, 40 hex chars). */
export function isOAuthValue(value: string): boolean {
  return OAUTH_VALUE_RE.test(value)
}

/** Parses and validates the arguments of `scripts/setup.ts`. */
export function parseSetupArgs(argv: readonly string[]): SetupOptions {
  const parsed = parseArgs(argv, {
    boolean: ['yes', 'force', 'help'],
    string: ['client-id', 'client-secret', 'login', 'dir'],
    alias: { y: 'yes', h: 'help' },
  })
  if (parsed.positionals.length > 0) throw new ArgsError(`Unexpected arguments: ${parsed.positionals.join(' ')}`)
  const clientId = parsed.strings['client-id']?.trim()
  const clientSecret = parsed.strings['client-secret']?.trim()
  const login = parsed.strings.login?.trim().replace(/^@/, '')
  if (clientId !== undefined && !isOAuthValue(clientId)) throw new ArgsError('--client-id does not look like a GitHub OAuth client ID')
  if (clientSecret !== undefined && !isOAuthValue(clientSecret)) throw new ArgsError('--client-secret does not look like a GitHub OAuth client secret')
  if (login !== undefined && !isGithubLogin(login)) throw new ArgsError('--login is not a valid GitHub username')
  return {
    clientId,
    clientSecret,
    login,
    yes: parsed.booleans.yes === true,
    force: parsed.booleans.force === true,
    dir: parsed.strings.dir,
    help: parsed.booleans.help === true,
  }
}

/** Values given as flags, by env key (an existing env file that is kept still gets them). */
export function givenEnvValues(options: Pick<SetupOptions, 'clientId' | 'clientSecret' | 'login'>): Record<string, string> {
  const values: Record<string, string> = {}
  if (options.clientId !== undefined) values.NUXT_OAUTH_GITHUB_CLIENT_ID = options.clientId
  if (options.clientSecret !== undefined) values.NUXT_OAUTH_GITHUB_CLIENT_SECRET = options.clientSecret
  if (options.login !== undefined) values.NUXT_OWNER_GITHUB_LOGIN = options.login
  return values
}

interface Assignment {
  /** Leading whitespace and optional `export `. */
  prefix: string
  key: string
  /** `=` with the spacing around it, as written. */
  separator: string
  value: string
  /** Inline comment after the value (with its leading spaces), if any. */
  tail: string
}

const ASSIGNMENT_RE = /^(\s*(?:export\s+)?)([A-Z_]\w*)(\s*=)(\s*)(.*)$/i

/** Splits a `KEY=value  # comment` line. Comment lines and blank lines return `null`. */
function parseAssignment(line: string): Assignment | null {
  const match = ASSIGNMENT_RE.exec(line)
  if (!match) return null
  const [, prefix = '', key = '', equals = '', space = '', rest = ''] = match
  const quote = rest[0]
  if (quote === '"' || quote === '\'' || quote === '`') {
    const end = rest.indexOf(quote, 1)
    if (end !== -1) return { prefix, key, separator: equals + space, value: rest.slice(1, end), tail: rest.slice(end + 1) }
  }
  // `KEY=` or `KEY=   # comment`: no value, the spacing belongs to the comment.
  if (rest === '' || rest.startsWith('#')) return { prefix, key, separator: equals, value: '', tail: rest && (space || ' ') + rest }
  const comment = /\s+#/.exec(rest)
  const valueEnd = comment ? comment.index : rest.length
  return { prefix, key, separator: equals + space, value: rest.slice(0, valueEnd).trim(), tail: rest.slice(valueEnd) }
}

/** Env file syntax for a value: bare when safe, single-quoted when it has spaces or `#`. */
export function formatEnvValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('Env values cannot contain line breaks')
  if (/^[^\s#"'`\\]*$/.test(value)) return value
  if (!value.includes('\'')) return `'${value}'`
  throw new Error('Env value contains characters that cannot be written safely')
}

export interface FilledEnv {
  text: string
  /** Keys that were not in the template and were appended at the end. */
  appended: string[]
}

/**
 * Sets `values` in an env template: the first uncommented `KEY=` line of each key gets the new value,
 * keeping comments, order, spacing, inline comments and line endings. Unknown keys are appended
 * (or skipped with `append: false`).
 */
export function fillEnvTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  { append = true }: { append?: boolean } = {},
): FilledEnv {
  const pending = new Map(Object.entries(values).map(([key, value]) => [key, formatEnvValue(value)]))
  // Odd indexes are the original line breaks, so mixed endings survive untouched.
  const parts = template.split(/(\r?\n)/)
  for (let i = 0; i < parts.length; i += 2) {
    const assignment = parseAssignment(parts[i] ?? '')
    if (!assignment) continue
    const value = pending.get(assignment.key)
    if (value === undefined) continue
    parts[i] = `${assignment.prefix}${assignment.key}${assignment.separator}${value}${assignment.tail}`
    pending.delete(assignment.key)
  }
  let text = parts.join('')
  const appended = append ? [...pending.keys()] : []
  if (appended.length > 0) {
    const eol = detectEol(template)
    if (text !== '' && !text.endsWith('\n')) text += eol
    text += appended.map(key => `${key}=${pending.get(key)}${eol}`).join('')
  }
  return { text, appended }
}

/** Keys of `keys` that are missing or empty in an env file text (only names are returned, never values). */
export function emptyEnvKeys(text: string, keys: readonly string[]): string[] {
  const filled = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const assignment = parseAssignment(line)
    if (assignment && assignment.value !== '') filled.add(assignment.key)
  }
  return keys.filter(key => !filled.has(key))
}

/**
 * Backup name for a replaced env file, e.g. `.env.bak-20261030-143005` (matched by the `.env.*` gitignore rule).
 * Gets a `-2`, `-3`... suffix while `taken(name)` is true, so an earlier backup (and its vault key) is never replaced.
 */
export function envBackupName(now: Date, taken: (name: string) => boolean = () => false): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const base = `${ENV_FILE}.bak-${date}-${time}`
  let name = base
  for (let n = 2; taken(name); n++) name = `${base}-${n}`
  return name
}
