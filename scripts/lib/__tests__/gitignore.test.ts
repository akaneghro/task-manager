import { describe, expect, it } from 'vitest'
import { detectEol, ensureGitignoreEntry, isIgnoredBy } from '../gitignore'

describe('detectEol', () => {
  it('detects CRLF and defaults to LF', () => {
    expect(detectEol('a\r\nb\r\n')).toBe('\r\n')
    expect(detectEol('a\nb\n')).toBe('\n')
    expect(detectEol(null)).toBe('\n')
    expect(detectEol('')).toBe('\n')
  })
})

describe('ensureGitignoreEntry', () => {
  it('creates the file content when missing or empty', () => {
    expect(ensureGitignoreEntry(null, '.mcp.json')).toEqual({ text: '.mcp.json\n', changed: true })
    expect(ensureGitignoreEntry('', '.mcp.json')).toEqual({ text: '.mcp.json\n', changed: true })
  })

  it('appends with LF', () => {
    expect(ensureGitignoreEntry('node_modules/\n', '.mcp.json')).toEqual({ text: 'node_modules/\n.mcp.json\n', changed: true })
  })

  it('preserves CRLF', () => {
    expect(ensureGitignoreEntry('node_modules/\r\ndist/\r\n', '.mcp.json'))
      .toEqual({ text: 'node_modules/\r\ndist/\r\n.mcp.json\r\n', changed: true })
  })

  it('adds the missing final newline before appending', () => {
    expect(ensureGitignoreEntry('node_modules/', '.mcp.json').text).toBe('node_modules/\n.mcp.json\n')
    expect(ensureGitignoreEntry('a\r\nnode_modules/', '.mcp.json').text).toBe('a\r\nnode_modules/\r\n.mcp.json\r\n')
  })

  it('does not duplicate an existing entry (any equivalent form)', () => {
    for (const text of [
      '.mcp.json\n',
      'node_modules/\n.mcp.json',
      '/.mcp.json\n',
      '**/.mcp.json\n',
      '  .mcp.json   \n',
      'x\r\n.mcp.json\r\n',
    ]) {
      expect(ensureGitignoreEntry(text, '.mcp.json')).toEqual({ text, changed: false })
    }
  })

  it('is idempotent', () => {
    const first = ensureGitignoreEntry('dist/', '.mcp.json')
    expect(ensureGitignoreEntry(first.text, '.mcp.json')).toEqual({ text: first.text, changed: false })
  })

  it('ignores comments and look-alike patterns', () => {
    expect(ensureGitignoreEntry('# .mcp.json\n', '.mcp.json').changed).toBe(true)
    expect(ensureGitignoreEntry('.mcp.json.bak\n', '.mcp.json').changed).toBe(true)
    expect(ensureGitignoreEntry('sub/.mcp.json\n', '.mcp.json').changed).toBe(true)
  })

  it('re-adds the entry when a later negation re-includes the file', () => {
    expect(isIgnoredBy('.mcp.json\n!.mcp.json\n', '.mcp.json')).toBe(false)
    expect(isIgnoredBy('!.mcp.json\n.mcp.json\n', '.mcp.json')).toBe(true)
    expect(ensureGitignoreEntry('.mcp.json\n!.mcp.json\n', '.mcp.json'))
      .toEqual({ text: '.mcp.json\n!.mcp.json\n.mcp.json\n', changed: true })
  })

  it('rejects an empty entry', () => {
    expect(() => ensureGitignoreEntry('x', '  ')).toThrow()
  })
})
