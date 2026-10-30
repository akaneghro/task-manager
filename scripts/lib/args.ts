// Tiny, dependency-free CLI argument parser shared by the scripts (pure, tested).

export class ArgsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArgsError'
  }
}

export interface ArgSpec {
  /** Flags without a value (`--dry-run`). */
  boolean?: readonly string[]
  /** Flags that take a value (`--url http://...` or `--url=http://...`). */
  string?: readonly string[]
  /** Short aliases: `{ h: 'help' }`. */
  alias?: Readonly<Record<string, string>>
}

export interface ParsedArgs {
  positionals: string[]
  booleans: Record<string, boolean>
  strings: Record<string, string>
}

/**
 * Parses `argv` (already without `node` and the script path).
 * Unknown flags, missing values and repeated value flags throw `ArgsError`. `--` ends flag parsing.
 */
export function parseArgs(argv: readonly string[], spec: ArgSpec = {}): ParsedArgs {
  const booleanFlags = new Set(spec.boolean ?? [])
  const stringFlags = new Set(spec.string ?? [])
  const alias = spec.alias ?? {}
  const result: ParsedArgs = { positionals: [], booleans: {}, strings: {} }
  for (const name of booleanFlags) result.booleans[name] = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === '--') {
      result.positionals.push(...argv.slice(i + 1))
      break
    }
    let name: string
    let inlineValue: string | undefined
    if (arg.startsWith('--') && arg.length > 2) {
      const eq = arg.indexOf('=')
      name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
      inlineValue = eq === -1 ? undefined : arg.slice(eq + 1)
    }
    else if (/^-[a-z]$/i.test(arg)) {
      const short = arg.slice(1)
      const long = alias[short]
      if (!long) throw new ArgsError(`Unknown option: ${arg}`)
      name = long
    }
    else {
      result.positionals.push(arg)
      continue
    }

    if (booleanFlags.has(name)) {
      if (inlineValue !== undefined) {
        if (inlineValue !== 'true' && inlineValue !== 'false') throw new ArgsError(`Option --${name} does not take a value`)
        result.booleans[name] = inlineValue === 'true'
      }
      else {
        result.booleans[name] = true
      }
    }
    else if (stringFlags.has(name)) {
      let value = inlineValue
      if (value === undefined) {
        const next = argv[i + 1]
        if (next === undefined || (next.startsWith('-') && next.length > 1)) throw new ArgsError(`Option --${name} requires a value`)
        value = next
        i++
      }
      if (value.trim() === '') throw new ArgsError(`Option --${name} requires a non-empty value`)
      if (name in result.strings) throw new ArgsError(`Option --${name} was given more than once`)
      result.strings[name] = value
    }
    else {
      throw new ArgsError(`Unknown option: --${name}`)
    }
  }
  return result
}

export interface ConnectOptions {
  repoPath: string
  projectSlug: string
  /** Base URL from `--url` (not yet normalised); `undefined` = use TM_URL / default. */
  url?: string
  /** MCP server name inside `.mcp.json`. */
  name: string
  envToken: boolean
  dryRun: boolean
  force: boolean
  help: boolean
}

export const CONNECT_USAGE = `Usage: pnpm connect <repoPath> <projectSlug> [options]

Writes (or updates) the Task Manager MCP server entry in <repoPath>/.mcp.json
and makes sure .mcp.json is gitignored in that repo.

Options:
  --url <base>     Task Manager base URL (default: TM_URL or http://localhost:3000)
  --name <name>    MCP server name in .mcp.json (default: task-manager)
  --env-token      Write "Bearer \${TM_TOKEN}" instead of the token itself
                   (Claude Code must then see TM_TOKEN in its environment)
  --force          Continue when the server cannot be reached or the project does not exist
  --dry-run        Show what would change without writing anything
  -h, --help       Show this help

The token is read from TM_TOKEN or asked for (hidden input).`

const SERVER_NAME_RE = /^[\w-]{1,64}$/

/** Parses and validates the arguments of `scripts/connect.ts`. */
export function parseConnectArgs(argv: readonly string[]): ConnectOptions {
  const parsed = parseArgs(argv, {
    boolean: ['env-token', 'dry-run', 'force', 'help'],
    string: ['url', 'name'],
    alias: { h: 'help' },
  })
  const help = parsed.booleans.help === true
  const [repoPath, projectSlug, ...extra] = parsed.positionals
  if (!help) {
    if (!repoPath || !projectSlug) throw new ArgsError('Missing arguments: <repoPath> <projectSlug>')
    if (extra.length > 0) throw new ArgsError(`Unexpected arguments: ${extra.join(' ')}`)
  }
  const name = parsed.strings.name ?? 'task-manager'
  if (!SERVER_NAME_RE.test(name)) throw new ArgsError('--name may only contain letters, numbers, "-" and "_"')
  return {
    repoPath: repoPath ?? '',
    projectSlug: (projectSlug ?? '').trim().toLowerCase(),
    url: parsed.strings.url,
    name,
    envToken: parsed.booleans['env-token'] === true,
    dryRun: parsed.booleans['dry-run'] === true,
    force: parsed.booleans.force === true,
    help,
  }
}
