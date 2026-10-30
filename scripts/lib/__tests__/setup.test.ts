import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArgsError } from '../args'
import {
  ENV_FILE,
  REQUIRED_ENV_KEYS,
  emptyEnvKeys,
  envBackupName,
  fillEnvTemplate,
  formatEnvValue,
  generateEnvSecrets,
  givenEnvValues,
  isGithubLogin,
  isOAuthValue,
  parseSetupArgs,
} from '../setup'

const TEMPLATE = [
  '# Database',
  'NUXT_DATABASE_URL=file:./data/task-manager.db',
  '# NUXT_DATABASE_AUTH_TOKEN=',
  '',
  '# Secrets (pnpm gen:keys)',
  'NUXT_SESSION_PASSWORD=',
  'NUXT_VAULT_KEY=   # 32 bytes, base64',
  '',
  'NUXT_OAUTH_GITHUB_CLIENT_ID=',
  'NUXT_OAUTH_GITHUB_CLIENT_SECRET=""',
  'export NUXT_OWNER_GITHUB_LOGIN = your-login',
  '',
].join('\n')

describe('parseSetupArgs', () => {
  it('parses defaults', () => {
    expect(parseSetupArgs([])).toEqual({
      clientId: undefined,
      clientSecret: undefined,
      login: undefined,
      yes: false,
      force: false,
      dir: undefined,
      help: false,
    })
  })

  it('parses every option', () => {
    const options = parseSetupArgs(['--client-id', 'Ov23liABCDEF123456', '--client-secret=0123456789abcdef0123456789abcdef01234567', '--login', '@octo-cat', '-y', '--force', '--dir', 'tmp'])
    expect(options).toEqual({
      clientId: 'Ov23liABCDEF123456',
      clientSecret: '0123456789abcdef0123456789abcdef01234567',
      login: 'octo-cat',
      yes: true,
      force: true,
      dir: 'tmp',
      help: false,
    })
    expect(parseSetupArgs(['-h']).help).toBe(true)
  })

  it('rejects positionals and malformed values', () => {
    expect(() => parseSetupArgs(['extra'])).toThrow(ArgsError)
    expect(() => parseSetupArgs(['--client-id', 'has space'])).toThrow(/--client-id/)
    expect(() => parseSetupArgs(['--client-secret', 'short'])).toThrow(/--client-secret/)
    expect(() => parseSetupArgs(['--login', 'bad--login'])).toThrow(/--login/)
  })
})

describe('validators', () => {
  it('accepts GitHub usernames only', () => {
    expect(isGithubLogin('akaneghro')).toBe(true)
    expect(isGithubLogin('a-b-1')).toBe(true)
    expect(isGithubLogin('-ab')).toBe(false)
    expect(isGithubLogin('ab-')).toBe(false)
    expect(isGithubLogin('a'.repeat(40))).toBe(false)
    expect(isGithubLogin('')).toBe(false)
  })

  it('accepts OAuth client ids and secrets', () => {
    expect(isOAuthValue('Iv1.0123456789abcdef')).toBe(true)
    expect(isOAuthValue('Ov23li0123456789abcd')).toBe(true)
    expect(isOAuthValue('0123456789abcdef0123456789abcdef01234567')).toBe(true)
    expect(isOAuthValue('abc')).toBe(false)
    expect(isOAuthValue('with space 123')).toBe(false)
  })
})

describe('generateEnvSecrets', () => {
  it('returns a base64url session password and a 32-byte base64 vault key, different each time', () => {
    const a = generateEnvSecrets()
    const b = generateEnvSecrets()
    expect(a.NUXT_SESSION_PASSWORD).toMatch(/^[\w-]{43}$/)
    expect(Buffer.from(a.NUXT_VAULT_KEY, 'base64')).toHaveLength(32)
    expect(a.NUXT_SESSION_PASSWORD).not.toBe(b.NUXT_SESSION_PASSWORD)
    expect(a.NUXT_VAULT_KEY).not.toBe(b.NUXT_VAULT_KEY)
  })
})

describe('formatEnvValue', () => {
  it('keeps safe values bare and quotes the rest', () => {
    expect(formatEnvValue('abc+/=_-.:')).toBe('abc+/=_-.:')
    expect(formatEnvValue('')).toBe('')
    expect(formatEnvValue('a b#c')).toBe('\'a b#c\'')
    expect(() => formatEnvValue('a\nb')).toThrow(/line breaks/)
    expect(() => formatEnvValue('it\'s "x"')).toThrow(/safely/)
  })
})

describe('fillEnvTemplate', () => {
  const values = {
    NUXT_SESSION_PASSWORD: 'pw',
    NUXT_VAULT_KEY: 'key=',
    NUXT_OAUTH_GITHUB_CLIENT_ID: 'id',
    NUXT_OAUTH_GITHUB_CLIENT_SECRET: 'secret',
    NUXT_OWNER_GITHUB_LOGIN: 'octocat',
  }

  it('fills values and keeps comments, order, spacing and inline comments', () => {
    expect(fillEnvTemplate(TEMPLATE, values)).toEqual({
      text: [
        '# Database',
        'NUXT_DATABASE_URL=file:./data/task-manager.db',
        '# NUXT_DATABASE_AUTH_TOKEN=',
        '',
        '# Secrets (pnpm gen:keys)',
        'NUXT_SESSION_PASSWORD=pw',
        'NUXT_VAULT_KEY=key=   # 32 bytes, base64',
        '',
        'NUXT_OAUTH_GITHUB_CLIENT_ID=id',
        'NUXT_OAUTH_GITHUB_CLIENT_SECRET=secret',
        'export NUXT_OWNER_GITHUB_LOGIN = octocat',
        '',
      ].join('\n'),
      appended: [],
    })
  })

  it('preserves CRLF line endings', () => {
    const crlf = TEMPLATE.replace(/\n/g, '\r\n')
    const { text } = fillEnvTemplate(crlf, values)
    expect(text).toBe(fillEnvTemplate(TEMPLATE, values).text.replace(/\n/g, '\r\n'))
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('leaves commented keys alone and appends keys missing from the template', () => {
    const { text, appended } = fillEnvTemplate('# NUXT_VAULT_KEY=\r\nA=1', { NUXT_VAULT_KEY: 'k' })
    expect(appended).toEqual(['NUXT_VAULT_KEY'])
    expect(text).toBe('# NUXT_VAULT_KEY=\r\nA=1\r\nNUXT_VAULT_KEY=k\r\n')
    expect(fillEnvTemplate('', { A: '1' }).text).toBe('A=1\n')
  })

  it('keeps a comment that follows an empty value separated from the new value', () => {
    const { text } = fillEnvTemplate('A=#note\nB=  # note\n', { A: 'x', B: 'y' })
    expect(text).toBe('A=x #note\nB=y  # note\n')
    expect(parseEnv(text)).toEqual({ A: 'x', B: 'y' })
  })

  it('only replaces the first assignment of a key', () => {
    expect(fillEnvTemplate('A=\nA=\n', { A: 'x' }).text).toBe('A=x\nA=\n')
  })

  it('returns the template unchanged without values', () => {
    expect(fillEnvTemplate(TEMPLATE, {})).toEqual({ text: TEMPLATE, appended: [] })
  })

  it('only sets keys already present with append: false', () => {
    expect(fillEnvTemplate('A=1\nB=2\n', { B: '', C: 'x' }, { append: false })).toEqual({ text: 'A=1\nB=\n', appended: [] })
  })

  it('writes flag values into a kept env file without touching its secrets', () => {
    const kept = fillEnvTemplate(TEMPLATE, generateEnvSecrets()).text
    const { text } = fillEnvTemplate(kept, givenEnvValues({ clientId: 'Ov23liAbcdef12', login: 'octocat' }))
    expect(parseEnv(text)).toEqual({ ...parseEnv(kept), NUXT_OAUTH_GITHUB_CLIENT_ID: 'Ov23liAbcdef12', NUXT_OWNER_GITHUB_LOGIN: 'octocat' })
    expect(emptyEnvKeys(text, REQUIRED_ENV_KEYS)).toEqual(['NUXT_OAUTH_GITHUB_CLIENT_SECRET'])
  })
})

describe('givenEnvValues', () => {
  it('maps only the flags that were given to their env keys', () => {
    expect(givenEnvValues({})).toEqual({})
    expect(givenEnvValues(parseSetupArgs(['--client-id', 'Ov23liAbcdef12', '--client-secret', 'secret_12345', '--login', '@octocat']))).toEqual({
      NUXT_OAUTH_GITHUB_CLIENT_ID: 'Ov23liAbcdef12',
      NUXT_OAUTH_GITHUB_CLIENT_SECRET: 'secret_12345',
      NUXT_OWNER_GITHUB_LOGIN: 'octocat',
    })
  })
})

describe('emptyEnvKeys', () => {
  it('lists required keys that are missing or empty', () => {
    expect(emptyEnvKeys(TEMPLATE, REQUIRED_ENV_KEYS)).toEqual([
      'NUXT_SESSION_PASSWORD',
      'NUXT_VAULT_KEY',
      'NUXT_OAUTH_GITHUB_CLIENT_ID',
      'NUXT_OAUTH_GITHUB_CLIENT_SECRET',
    ])
    expect(emptyEnvKeys('# A=1\nB="x"', ['A', 'B'])).toEqual(['A'])
  })

  it('is empty once the template is filled', () => {
    const { text } = fillEnvTemplate(TEMPLATE, { ...generateEnvSecrets(), NUXT_OAUTH_GITHUB_CLIENT_ID: 'id', NUXT_OAUTH_GITHUB_CLIENT_SECRET: 's' })
    expect(emptyEnvKeys(text, REQUIRED_ENV_KEYS)).toEqual([])
  })
})

describe('envBackupName', () => {
  it('uses a local timestamp covered by the env gitignore pattern', () => {
    expect(envBackupName(new Date(2026, 9, 3, 7, 5, 9))).toBe(`${ENV_FILE}.bak-20261003-070509`)
  })

  it('never reuses the name of an existing backup (two runs in the same second)', () => {
    const base = `${ENV_FILE}.bak-20261003-070509`
    const existing = new Set([base, `${base}-2`])
    expect(envBackupName(new Date(2026, 9, 3, 7, 5, 9), name => existing.has(name))).toBe(`${base}-3`)
  })
})

describe('filled template parsed by Node', () => {
  it('reads back exactly the values that were written (util.parseEnv = process.loadEnvFile)', () => {
    const secrets = generateEnvSecrets()
    const { text } = fillEnvTemplate(TEMPLATE, { ...secrets, NUXT_OAUTH_GITHUB_CLIENT_SECRET: 'a b#c', NUXT_OWNER_GITHUB_LOGIN: 'octocat' })
    expect(parseEnv(text)).toEqual({
      ...secrets,
      NUXT_DATABASE_URL: 'file:./data/task-manager.db',
      NUXT_OAUTH_GITHUB_CLIENT_ID: '',
      NUXT_OAUTH_GITHUB_CLIENT_SECRET: 'a b#c',
      NUXT_OWNER_GITHUB_LOGIN: 'octocat',
    })
  })
})
