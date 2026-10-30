// Pure helpers to build and merge the Claude Code project MCP config (`.mcp.json`) (tested).

import { detectEol } from './gitignore'
import type { TextChange } from './gitignore'

export interface McpHttpServerEntry {
  type: 'http'
  url: string
  headers: Record<string, string>
}

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpConfigError'
  }
}

/** Literal written with `--env-token`: Claude Code expands `${TM_TOKEN}` from its environment. */
/** UTF-8 byte order mark (kept when the existing file has one). */
export const BOM = String.fromCharCode(0xFEFF)

export const ENV_TOKEN_HEADER = 'Bearer ${TM_TOKEN}'

/** Validates an http(s) base URL and strips trailing slashes. Throws `McpConfigError` when invalid. */
export function normalizeBaseUrl(raw: string): string {
  const value = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  }
  catch {
    throw new McpConfigError(`Invalid URL: ${value}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new McpConfigError(`Only http(s) URLs are supported: ${value}`)
  if (parsed.search || parsed.hash) throw new McpConfigError(`The base URL must not contain a query or fragment: ${value}`)
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
}

/** `true` for http URLs that are not loopback (the token would travel in clear text). */
export function isInsecureRemoteUrl(baseUrl: string): boolean {
  const { protocol, hostname } = new URL(baseUrl)
  if (protocol !== 'http:') return false
  return !['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname) && !hostname.endsWith('.localhost')
}

export interface McpEntryOptions {
  baseUrl: string
  projectSlug: string
  /** Plain token (`tm_...`). Ignored when `envToken` is true. */
  token: string
  envToken: boolean
}

export function buildMcpEntry(options: McpEntryOptions): McpHttpServerEntry {
  return {
    type: 'http',
    url: `${options.baseUrl}/mcp`,
    headers: {
      'Authorization': options.envToken ? ENV_TOKEN_HEADER : `Bearer ${options.token}`,
      'X-TM-Project': options.projectSlug,
    },
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

/**
 * Merges `entry` as `mcpServers[name]` into the existing `.mcp.json` text (`null` = no file).
 * Other servers and top-level keys keep their order; a replaced server keeps its position.
 * The output uses 2-space indentation, the existing line endings (CRLF/LF) and a trailing newline.
 * When the same entry is already present the text is returned untouched (`changed: false`).
 * Throws `McpConfigError` on invalid JSON or an unexpected shape, so the caller never overwrites a broken file.
 */
export function mergeMcpConfig(existingText: string | null, entry: McpHttpServerEntry, name: string): TextChange {
  const hasBom = existingText?.startsWith(BOM) ?? false
  const source = hasBom ? (existingText as string).slice(1) : (existingText ?? '')
  let root: Record<string, unknown> = {}
  if (source.trim() !== '') {
    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    }
    catch (error) {
      throw new McpConfigError(`.mcp.json is not valid JSON (${error instanceof Error ? error.message : String(error)})`)
    }
    if (!isPlainObject(parsed)) throw new McpConfigError('.mcp.json must contain a JSON object')
    root = parsed
  }

  const servers = Object.hasOwn(root, 'mcpServers') ? root.mcpServers : {}
  if (!isPlainObject(servers)) throw new McpConfigError('"mcpServers" in .mcp.json must be an object')
  if (existingText !== null && deepEqual(servers[name], entry)) return { text: existingText, changed: false }

  const next: Record<string, unknown> = { ...root, mcpServers: { ...servers, [name]: entry } }
  const eol = detectEol(existingText)
  let text = `${JSON.stringify(next, null, 2)}\n`
  if (eol === '\r\n') text = text.replace(/\n/g, '\r\n')
  if (hasBom) text = `${BOM}${text}`
  return { text, changed: text !== existingText }
}

/** Replaces the plain token in a text (for previews/logs). Never print a token. */
export function redactToken(text: string, token: string): string {
  if (!token) return text
  return text.split(token).join(`${token.slice(0, 6)}…(redacted)`)
}

/** `claude mcp add ...` alternative (local scope, token placeholder). */
export function claudeMcpAddCommand(name: string, baseUrl: string, projectSlug: string): string {
  return `claude mcp add --transport http ${name} ${baseUrl}/mcp --header "Authorization: Bearer <YOUR_TOKEN>" --header "X-TM-Project: ${projectSlug}" -s local`
}
