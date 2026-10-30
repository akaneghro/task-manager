import { describe, expect, it } from 'vitest'
import { actorForShareLink, actorForUser, parseBearerToken, sessionUserFromRow, usableVaultKey } from '../actor'

const TEST_VAULT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

describe('actorForUser', () => {
  it('builds an owner actor without memberships', () => {
    expect(actorForUser({ id: 'u1', role: 'owner' }, { p1: 'viewer' })).toEqual({ kind: 'owner', userId: 'u1', source: 'user:u1' })
  })

  it('builds a member actor with a copy of the memberships', () => {
    const memberships = { p1: 'viewer' as const, p2: 'commenter' as const }
    const actor = actorForUser({ id: 'u2', role: 'member' }, memberships)
    expect(actor).toEqual({ kind: 'member', userId: 'u2', source: 'user:u2', memberships })
    if (actor.kind !== 'member') throw new Error('expected member')
    expect(actor.memberships).not.toBe(memberships)
  })

  it('defaults to no memberships', () => {
    expect(actorForUser({ id: 'u3', role: 'member' })).toEqual({ kind: 'member', userId: 'u3', source: 'user:u3', memberships: {} })
  })
})

describe('actorForShareLink', () => {
  it('builds a public actor scoped to the project', () => {
    expect(actorForShareLink({ shareLinkId: 's1', projectId: 'p1' }))
      .toEqual({ kind: 'public', projectId: 'p1', shareLinkId: 's1', source: 'public:s1' })
  })
})

describe('sessionUserFromRow', () => {
  it('keeps only public profile fields', () => {
    expect(sessionUserFromRow({ id: 'u1', githubLogin: 'octo', name: null, avatarUrl: 'https://x/y.png', role: 'member' }))
      .toEqual({ id: 'u1', login: 'octo', name: null, avatarUrl: 'https://x/y.png', role: 'member' })
  })
})

describe('parseBearerToken', () => {
  it('extracts the token', () => {
    expect(parseBearerToken('Bearer tm_abc')).toBe('tm_abc')
    expect(parseBearerToken('bearer   tm_abc  ')).toBe('tm_abc')
  })

  it('rejects other schemes and malformed values', () => {
    expect(parseBearerToken(undefined)).toBeNull()
    expect(parseBearerToken(null)).toBeNull()
    expect(parseBearerToken('')).toBeNull()
    expect(parseBearerToken('Bearer')).toBeNull()
    expect(parseBearerToken('Basic dXNlcjpwYXNz')).toBeNull()
    expect(parseBearerToken('Bearer a b')).toBeNull()
    expect(parseBearerToken('tm_abc')).toBeNull()
  })
})

describe('usableVaultKey', () => {
  it('returns a valid key', () => {
    expect(usableVaultKey(TEST_VAULT_KEY)).toBe(TEST_VAULT_KEY)
  })

  it('drops missing or invalid keys', () => {
    expect(usableVaultKey('')).toBeUndefined()
    expect(usableVaultKey(undefined)).toBeUndefined()
    expect(usableVaultKey(12345)).toBeUndefined()
    expect(usableVaultKey('dG9vLXNob3J0')).toBeUndefined()
    expect(usableVaultKey('%%%not-base64%%%')).toBeUndefined()
  })
})
