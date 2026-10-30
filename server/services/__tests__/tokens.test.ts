import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { apiTokens, users } from '../../db/schema'
import { sha256Hex } from '../../utils/crypto'
import { ServiceError } from '../context'
import { authenticateApiToken, createToken, listTokens, revokeToken } from '../tokens'
import { createMemberUser, createTestDb, makeCtx, mcpActor, memberActor, ownerActor } from './helpers'
import type { TestDb } from './helpers'

let t: TestDb

beforeEach(async () => {
  t = await createTestDb()
})
afterEach(() => t.cleanup())

const owner = () => makeCtx(t.db, ownerActor(t.ownerId))

async function expectCode(promise: Promise<unknown>, code: ServiceError['code']) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(ServiceError)
  expect((error as ServiceError).code).toBe(code)
}

describe('tokens', () => {
  it('creates a token, stores only its hash and authenticates it', async () => {
    const created = await createToken(owner(), { name: 'laptop', allowSecrets: true })
    expect(created.token).toMatch(/^tm_[\w-]{43}$/)
    expect(created.tokenPrefix).toBe(created.token.slice(0, 9))
    expect(created).toMatchObject({ name: 'laptop', allowSecrets: true, expiresAt: null, lastUsedAt: null })

    const [row] = await t.db.select().from(apiTokens).where(eq(apiTokens.id, created.id))
    expect(row?.tokenHash).toBe(await sha256Hex(created.token))
    expect(JSON.stringify(row)).not.toContain(created.token)

    const listed = await listTokens(owner())
    expect(listed.map(x => x.id)).toEqual([created.id])
    expect(JSON.stringify(listed)).not.toContain(created.token)

    expect(await authenticateApiToken(t.db, created.token)).toEqual({
      tokenId: created.id,
      tokenName: 'laptop',
      userId: t.ownerId,
      allowSecrets: true,
    })
  })

  it('throttles last_used_at updates to once a minute', async () => {
    const created = await createToken(owner(), { name: 'laptop' })
    const t0 = new Date('2026-03-01T00:00:00Z')
    const lastUsed = async () => (await t.db.select().from(apiTokens).where(eq(apiTokens.id, created.id)))[0]?.lastUsedAt?.getTime()
    await authenticateApiToken(t.db, created.token, t0)
    expect(await lastUsed()).toBe(t0.getTime())
    await authenticateApiToken(t.db, created.token, new Date(t0.getTime() + 59_000))
    expect(await lastUsed()).toBe(t0.getTime())
    const t2 = new Date(t0.getTime() + 60_000)
    await authenticateApiToken(t.db, created.token, t2)
    expect(await lastUsed()).toBe(t2.getTime())
  })

  it('rejects unknown, malformed and revoked tokens', async () => {
    const created = await createToken(owner(), { name: 'laptop' })
    expect(await authenticateApiToken(t.db, 'tm_unknown')).toBeNull()
    expect(await authenticateApiToken(t.db, 'nope')).toBeNull()
    expect(await authenticateApiToken(t.db, '')).toBeNull()
    await revokeToken(owner(), created.id)
    expect(await authenticateApiToken(t.db, created.token)).toBeNull()
    expect(await listTokens(owner())).toEqual([])
    await expectCode(revokeToken(owner(), created.id), 'not_found')
  })

  it('expires tokens', async () => {
    const now = new Date('2026-03-01T00:00:00Z')
    const ctx = makeCtx(t.db, ownerActor(t.ownerId), { now: () => now })
    const created = await createToken(ctx, { name: 'temp', expiresInDays: 1 })
    expect(created.expiresAt).toBe('2026-03-02T00:00:00.000Z')
    expect(await authenticateApiToken(t.db, created.token, new Date('2026-03-01T23:59:59Z'))).not.toBeNull()
    expect(await authenticateApiToken(t.db, created.token, new Date('2026-03-02T00:00:00Z'))).toBeNull()
  })

  it('rejects tokens whose user no longer exists', async () => {
    const memberId = await createMemberUser(t.db, 'guest', 50)
    const now = new Date()
    await t.db.insert(apiTokens).values({ userId: memberId, name: 'x', tokenHash: await sha256Hex('tm_orphan'), tokenPrefix: 'tm_orpha', createdAt: now })
    expect(await authenticateApiToken(t.db, 'tm_orphan')).not.toBeNull()
    await t.db.delete(users).where(eq(users.id, memberId))
    expect(await authenticateApiToken(t.db, 'tm_orphan')).toBeNull()
  })

  it('enforces unique names among active tokens but frees names on revoke', async () => {
    const first = await createToken(owner(), { name: 'laptop' })
    await expectCode(createToken(owner(), { name: 'Laptop' }), 'conflict')
    await revokeToken(owner(), first.id)
    const [revoked] = await t.db.select().from(apiTokens).where(eq(apiTokens.id, first.id))
    expect(revoked?.name).toBe(`laptop (revoked ${first.id})`)
    const second = await createToken(owner(), { name: 'laptop' })
    expect(second.name).toBe('laptop')
    expect((await listTokens(owner())).map(x => x.id)).toEqual([second.id])
  })

  it('renames legacy revoked rows that still hold the name', async () => {
    await t.db.insert(apiTokens).values({
      userId: t.ownerId,
      name: 'ci',
      tokenHash: 'legacy-hash',
      tokenPrefix: 'tm_legac',
      revokedAt: new Date(),
    })
    const created = await createToken(owner(), { name: 'ci' })
    expect(created.name).toBe('ci')
  })

  it('validates input and is owner only', async () => {
    await expectCode(createToken(owner(), { name: 'bad/name' }), 'invalid')
    await expectCode(createToken(owner(), { name: 'x', expiresInDays: 0 }), 'invalid')
    const mcp = makeCtx(t.db, mcpActor(t.ownerId))
    await expectCode(listTokens(mcp), 'forbidden')
    await expectCode(createToken(mcp, { name: 'x' }), 'forbidden')
    const memberId = await createMemberUser(t.db, 'guest', 50)
    await expectCode(listTokens(makeCtx(t.db, memberActor(memberId, {}))), 'forbidden')
  })

  it('cannot revoke tokens of another user', async () => {
    const memberId = await createMemberUser(t.db, 'guest', 50)
    const [other] = await t.db.insert(apiTokens).values({
      userId: memberId,
      name: 'theirs',
      tokenHash: await sha256Hex('tm_theirs'),
      tokenPrefix: 'tm_their',
    }).returning()
    await expectCode(revokeToken(owner(), other?.id ?? ''), 'not_found')
  })
})
