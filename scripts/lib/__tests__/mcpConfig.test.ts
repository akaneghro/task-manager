import { describe, expect, it } from 'vitest'
import {
  BOM,
  ENV_TOKEN_HEADER,
  McpConfigError,
  buildMcpEntry,
  claudeMcpAddCommand,
  isInsecureRemoteUrl,
  mergeMcpConfig,
  normalizeBaseUrl,
  redactToken,
} from '../mcpConfig'

const TOKEN = 'tm_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
const entry = buildMcpEntry({ baseUrl: 'http://localhost:3000', projectSlug: 'demo-web', token: TOKEN, envToken: false })

describe('buildMcpEntry', () => {
  it('builds an http entry with bearer token and project header', () => {
    expect(entry).toEqual({
      type: 'http',
      url: 'http://localhost:3000/mcp',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'X-TM-Project': 'demo-web' },
    })
  })

  it('writes an env placeholder instead of the token with envToken', () => {
    const e = buildMcpEntry({ baseUrl: 'https://tm.example.com', projectSlug: 'x', token: TOKEN, envToken: true })
    expect(e.headers.Authorization).toBe(ENV_TOKEN_HEADER)
    expect(JSON.stringify(e)).not.toContain(TOKEN)
  })
})

describe('normalizeBaseUrl', () => {
  it('strips trailing slashes and keeps sub paths', () => {
    expect(normalizeBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(normalizeBaseUrl(' https://example.com/tm/// ')).toBe('https://example.com/tm')
  })

  it('rejects invalid or non-http URLs', () => {
    expect(() => normalizeBaseUrl('localhost:3000')).toThrow(McpConfigError)
    expect(() => normalizeBaseUrl('not a url')).toThrow(McpConfigError)
    expect(() => normalizeBaseUrl('ftp://example.com')).toThrow(McpConfigError)
    expect(() => normalizeBaseUrl('https://example.com/?a=1')).toThrow(McpConfigError)
  })
})

describe('isInsecureRemoteUrl', () => {
  it('flags plain http to remote hosts only', () => {
    expect(isInsecureRemoteUrl('http://localhost:3000')).toBe(false)
    expect(isInsecureRemoteUrl('http://127.0.0.1:3000')).toBe(false)
    expect(isInsecureRemoteUrl('https://tm.example.com')).toBe(false)
    expect(isInsecureRemoteUrl('http://tm.example.com')).toBe(true)
  })
})

describe('mergeMcpConfig', () => {
  it('creates a new file when none exists', () => {
    const { text, changed } = mergeMcpConfig(null, entry, 'task-manager')
    expect(changed).toBe(true)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).not.toContain('\r\n')
    expect(JSON.parse(text)).toEqual({ mcpServers: { 'task-manager': entry } })
    expect(text).toContain('\n  "mcpServers": {\n    "task-manager": {')
  })

  it('treats an empty or whitespace-only file as empty config', () => {
    expect(JSON.parse(mergeMcpConfig('  \n', entry, 'tm').text)).toEqual({ mcpServers: { tm: entry } })
  })

  it('keeps other servers, top-level keys and their order', () => {
    const existing = JSON.stringify({
      $schema: 'x',
      mcpServers: { 'alpha': { command: 'a' }, 'task-manager': { type: 'http', url: 'old' }, 'omega': { command: 'z' } },
      extra: true,
    }, null, 2)
    const { text, changed } = mergeMcpConfig(existing, entry, 'task-manager')
    expect(changed).toBe(true)
    const parsed = JSON.parse(text) as { mcpServers: Record<string, unknown> }
    expect(Object.keys(parsed)).toEqual(['$schema', 'mcpServers', 'extra'])
    expect(Object.keys(parsed.mcpServers)).toEqual(['alpha', 'task-manager', 'omega'])
    expect(parsed.mcpServers.alpha).toEqual({ command: 'a' })
    expect(parsed.mcpServers['task-manager']).toEqual(entry)
  })

  it('appends a new server after the existing ones', () => {
    const existing = '{\n  "mcpServers": {\n    "other": { "command": "x" }\n  }\n}\n'
    const parsed = JSON.parse(mergeMcpConfig(existing, entry, 'task-manager').text) as { mcpServers: Record<string, unknown> }
    expect(Object.keys(parsed.mcpServers)).toEqual(['other', 'task-manager'])
  })

  it('adds mcpServers when the file has other keys only', () => {
    const parsed = JSON.parse(mergeMcpConfig('{"foo":1}', entry, 'tm').text) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['foo', 'mcpServers'])
  })

  it('preserves CRLF line endings', () => {
    const existing = '{\r\n  "mcpServers": {\r\n    "other": {\r\n      "command": "x"\r\n    }\r\n  }\r\n}\r\n'
    const { text } = mergeMcpConfig(existing, entry, 'task-manager')
    expect(text.endsWith('}\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('preserves a UTF-8 BOM', () => {
    const { text } = mergeMcpConfig(`${BOM}{"mcpServers":{}}`, entry, 'tm')
    expect(text.startsWith(`${BOM}{`)).toBe(true)
    expect(JSON.parse(text.slice(1))).toEqual({ mcpServers: { tm: entry } })
  })

  it('is idempotent and does not reformat when nothing changes', () => {
    const first = mergeMcpConfig(null, entry, 'task-manager')
    const second = mergeMcpConfig(first.text, entry, 'task-manager')
    expect(second).toEqual({ text: first.text, changed: false })

    const compact = JSON.stringify({ mcpServers: { 'task-manager': entry } })
    expect(mergeMcpConfig(compact, entry, 'task-manager')).toEqual({ text: compact, changed: false })
  })

  it('updates the entry when the token or project changes', () => {
    const first = mergeMcpConfig(null, entry, 'task-manager').text
    const other = buildMcpEntry({ baseUrl: 'http://localhost:3000', projectSlug: 'idea-box', token: TOKEN, envToken: false })
    const { text, changed } = mergeMcpConfig(first, other, 'task-manager')
    expect(changed).toBe(true)
    expect((JSON.parse(text) as { mcpServers: Record<string, McpEntryShape> }).mcpServers['task-manager']?.headers['X-TM-Project']).toBe('idea-box')
  })

  it('throws on invalid JSON (so nothing gets overwritten)', () => {
    expect(() => mergeMcpConfig('{ "mcpServers": { ', entry, 'tm')).toThrow(McpConfigError)
    expect(() => mergeMcpConfig('// comment\n{}', entry, 'tm')).toThrow(/not valid JSON/)
  })

  it('throws on unexpected shapes', () => {
    expect(() => mergeMcpConfig('[]', entry, 'tm')).toThrow(McpConfigError)
    expect(() => mergeMcpConfig('"x"', entry, 'tm')).toThrow(McpConfigError)
    expect(() => mergeMcpConfig('{"mcpServers": []}', entry, 'tm')).toThrow(/must be an object/)
    expect(() => mergeMcpConfig('{"mcpServers": null}', entry, 'tm')).toThrow(McpConfigError)
  })
})

interface McpEntryShape {
  headers: Record<string, string>
}

describe('redactToken / claudeMcpAddCommand', () => {
  it('never leaves the token in redacted text', () => {
    const text = mergeMcpConfig(null, entry, 'tm').text
    const redacted = redactToken(text, TOKEN)
    expect(redacted).not.toContain(TOKEN)
    expect(redacted).toContain('tm_abc')
    expect(redactToken('abc', '')).toBe('abc')
  })

  it('builds the claude mcp add alternative with a placeholder', () => {
    const cmd = claudeMcpAddCommand('task-manager', 'http://localhost:3000', 'demo-web')
    expect(cmd).toBe('claude mcp add --transport http task-manager http://localhost:3000/mcp --header "Authorization: Bearer <YOUR_TOKEN>" --header "X-TM-Project: demo-web" -s local')
  })
})
