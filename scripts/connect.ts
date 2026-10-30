// Connects another repository to Task Manager: writes its project MCP config (.mcp.json) and gitignores it.
// Usage: pnpm connect <repoPath> <projectSlug> [--url <base>] [--name task-manager] [--env-token] [--force] [--dry-run]

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { slugSchema } from '../shared/schemas/common'
import { ArgsError, CONNECT_USAGE, parseConnectArgs } from './lib/args'
import type { ConnectOptions } from './lib/args'
import { loadProjectEnv } from './lib/env'
import { ensureGitignoreEntry } from './lib/gitignore'
import {
  ENV_TOKEN_HEADER,
  McpConfigError,
  buildMcpEntry,
  claudeMcpAddCommand,
  isInsecureRemoteUrl,
  mergeMcpConfig,
  normalizeBaseUrl,
  redactToken,
} from './lib/mcpConfig'

const DEFAULT_BASE_URL = 'http://localhost:3000'
const MCP_FILE = '.mcp.json'

class ConnectError extends Error {}

function warn(message: string): void {
  console.warn(`! ${message}`)
}

function readTextIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** Reads a line from the terminal without echoing it. */
async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new ConnectError('No TTY to ask for the token. Set the TM_TOKEN environment variable and run again.')
  }
  let muted = false
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      if (!muted) process.stdout.write(chunk)
      callback()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  try {
    process.stdout.write(question)
    muted = true
    return (await rl.question('')).trim()
  }
  finally {
    rl.close()
    process.stdout.write('\n')
  }
}

interface CheckResult {
  tokenName: string
  projectExists: boolean
}

function parseCheckResult(value: unknown): CheckResult | null {
  if (typeof value !== 'object' || value === null) return null
  const { tokenName, projectExists } = value as Record<string, unknown>
  if (typeof tokenName !== 'string' || typeof projectExists !== 'boolean') return null
  return { tokenName, projectExists }
}

/** Verifies the token and the project against the running server. */
async function verify(baseUrl: string, token: string, options: ConnectOptions): Promise<void> {
  const url = `${baseUrl}/api/connect/check?project=${encodeURIComponent(options.projectSlug)}`
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (!options.force) {
      throw new ConnectError(`Could not reach ${baseUrl} (${reason}). Is the server running? Use --force to write the config anyway.`)
    }
    warn(`Could not reach ${baseUrl} (${reason}); continuing because of --force.`)
    return
  }

  if (response.status === 401) throw new ConnectError('Invalid token (401). Create a new one in Task Manager > Settings > API tokens.')
  if (!response.ok) {
    const message = `Unexpected response from ${url}: HTTP ${response.status}`
    if (!options.force) throw new ConnectError(`${message}. Use --force to write the config anyway.`)
    warn(`${message}; continuing because of --force.`)
    return
  }

  const result = parseCheckResult(await response.json().catch(() => null))
  if (!result) throw new ConnectError(`Unexpected response from ${url} (is --url pointing at Task Manager?)`)
  console.log(`Token OK (${result.tokenName}).`)
  if (!result.projectExists) {
    const message = `Project "${options.projectSlug}" does not exist. Create it first in ${baseUrl}/projects (or ask Claude to use create_project).`
    if (!options.force) throw new ConnectError(message)
    warn(`${message} Continuing because of --force.`)
  }
}

/** Returns `true` when `.mcp.json` is tracked by git, `false` when not, `null` when git is unavailable. */
function isTrackedByGit(repo: string): boolean | null {
  const result = spawnSync('git', ['-C', repo, 'ls-files', '--error-unmatch', MCP_FILE], { stdio: 'ignore', windowsHide: true })
  if (result.error) return null
  return result.status === 0
}

async function run(options: ConnectOptions): Promise<void> {
  // 1) Repository
  const repo = resolve(options.repoPath)
  if (!existsSync(repo) || !statSync(repo).isDirectory()) throw new ConnectError(`Not a directory: ${repo}`)
  if (!existsSync(join(repo, '.git'))) warn(`${repo} does not look like a git repository (no .git).`)

  const slug = slugSchema.safeParse(options.projectSlug)
  if (!slug.success) throw new ConnectError(`Invalid project slug "${options.projectSlug}" (lowercase letters, numbers and dashes).`)
  const projectSlug = slug.data

  // 2) Base URL
  const baseUrl = normalizeBaseUrl(options.url ?? process.env.TM_URL ?? DEFAULT_BASE_URL)
  if (isInsecureRemoteUrl(baseUrl)) warn(`${baseUrl} uses plain http: the token would travel unencrypted. Prefer https.`)

  // Fail fast on a broken .mcp.json before asking for the token (re-read below, right before writing).
  const mcpPath = join(repo, MCP_FILE)
  mergeMcpConfig(readTextIfExists(mcpPath), buildMcpEntry({ baseUrl, projectSlug, token: '', envToken: true }), options.name)

  // 3) Token
  const fromEnv = process.env.TM_TOKEN?.trim()
  const token = fromEnv || await promptHidden('Task Manager API token (input hidden): ')
  if (!token) throw new ConnectError('No token given. Create one in Task Manager > Settings > API tokens.')
  if (!token.startsWith('tm_')) warn('The token does not start with "tm_"; double-check you pasted a Task Manager API token.')

  // 4) Verify against the server
  console.log(`Checking ${baseUrl} ...`)
  await verify(baseUrl, token, { ...options, projectSlug })

  // 5) .mcp.json
  const entry = buildMcpEntry({ baseUrl, projectSlug, token, envToken: options.envToken })
  const mcp = mergeMcpConfig(readTextIfExists(mcpPath), entry, options.name)

  // 6) .gitignore
  const gitignorePath = join(repo, '.gitignore')
  const gitignore = ensureGitignoreEntry(readTextIfExists(gitignorePath), MCP_FILE)

  if (options.dryRun) {
    console.log(`\n[dry-run] ${mcpPath}: ${mcp.changed ? 'would be written' : 'already up to date'}`)
    if (mcp.changed) console.log(redactToken(mcp.text, token))
    console.log(`[dry-run] ${gitignorePath}: ${gitignore.changed ? `would add "${MCP_FILE}"` : 'already ignores it'}`)
  }
  else {
    if (mcp.changed) writeFileSync(mcpPath, mcp.text, 'utf8')
    console.log(`${mcpPath}: ${mcp.changed ? `server "${options.name}" written` : 'already up to date'}`)
    if (gitignore.changed) writeFileSync(gitignorePath, gitignore.text, 'utf8')
    console.log(`${gitignorePath}: ${gitignore.changed ? `added "${MCP_FILE}"` : `already ignores ${MCP_FILE}`}`)
  }

  // 7) Already tracked?
  if (isTrackedByGit(repo) === true) {
    warn(`${MCP_FILE} is tracked by git in this repo, so the token could be committed. Untrack it with:`)
    console.warn(`    git -C "${repo}" rm --cached ${MCP_FILE}`)
  }

  if (options.envToken) {
    console.log(`\nThe config uses "${ENV_TOKEN_HEADER}": Claude Code must see TM_TOKEN in its environment.`)
    if (!fromEnv) warn('TM_TOKEN is not set in this shell; set it (user environment variable) before opening Claude Code.')
  }

  // 8) Next steps
  console.log([
    '',
    'Next steps:',
    `  1. Open Claude Code in ${repo}`,
    `  2. Approve the project MCP server "${options.name}" when asked (or check it with /mcp)`,
    '  3. Run /mcp to confirm it is connected',
    '  4. Try: "usa get_context" (or "use get_context")',
    '',
    'Troubleshooting: if /mcp shows the server as "needs authentication" (and Authenticate fails), the API token',
    'was revoked, expired or mistyped: create a new one in Settings > API tokens and rerun this command.',
    '',
    'Alternative without .mcp.json (stored in your local Claude Code config):',
    `  ${claudeMcpAddCommand(options.name, baseUrl, projectSlug)}`,
  ].join('\n'))
}

async function main(): Promise<void> {
  const options = parseConnectArgs(process.argv.slice(2))
  if (options.help) {
    console.log(CONNECT_USAGE)
    return
  }
  loadProjectEnv()
  await run(options)
}

main().catch((error: unknown) => {
  if (error instanceof ArgsError) {
    console.error(`${error.message}\n\n${CONNECT_USAGE}`)
  }
  else if (error instanceof McpConfigError) {
    console.error(`Error: ${error.message}. Nothing was written.`)
  }
  else if (error instanceof ConnectError) {
    console.error(`Error: ${error.message}`)
  }
  else {
    console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`)
  }
  process.exitCode = 1
})
