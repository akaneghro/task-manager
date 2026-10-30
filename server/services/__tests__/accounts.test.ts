import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { projectAccounts } from '../../db/schema'
import { ServiceError } from '../context'
import { createProject } from '../projects'
import {
  createAccount,
  deleteAccount,
  getSharedSecret,
  listAccounts,
  listSharedSecrets,
  revealSecret,
  updateAccount,
} from '../accounts'
import { createMemberUser, createTestDb, makeCtx, mcpActor, memberActor, ownerActor } from './helpers'
import type { TestDb } from './helpers'

let t: TestDb

beforeEach(async () => {
  t = await createTestDb()
})
afterEach(() => t.cleanup())

const owner = () => makeCtx(t.db, ownerActor(t.ownerId))
const mcp = (allowSecrets: boolean) => makeCtx(t.db, mcpActor(t.ownerId, { allowSecrets, tokenName: 'claude-repo' }))

async function expectCode(promise: Promise<unknown>, code: ServiceError['code']) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(ServiceError)
  expect((error as ServiceError).code).toBe(code)
}

async function rawRow(id: string) {
  const [row] = await t.db.select().from(projectAccounts).where(eq(projectAccounts.id, id))
  if (!row) throw new Error('row not found')
  return row
}

describe('vault (owner)', () => {
  it('encrypts on create, never returns the secret, reveals and logs the access', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const acc = await createAccount(owner(), 'alpha', { service: 'Stripe', username: 'me@x.com', secret: 'sk_live_123', url: 'https://stripe.com' })
    expect(acc).toMatchObject({ service: 'Stripe', username: 'me@x.com', hasSecret: true, shareWithClaude: false, accessCount: 0, lastAccessedAt: null })
    expect(JSON.stringify(acc)).not.toContain('sk_live_123')
    expect(Object.keys(acc)).not.toContain('secretEnc')

    const row = await rawRow(acc.id)
    expect(row.secretEnc).toMatch(/^v1:/)
    expect(row.secretEnc).not.toContain('sk_live_123')

    const now = new Date('2026-06-01T12:00:00Z')
    const revealed = await revealSecret(makeCtx(t.db, ownerActor(t.ownerId), { now: () => now }), acc.id)
    expect(revealed).toEqual({ secret: 'sk_live_123' })
    const [listed] = await listAccounts(owner(), 'alpha')
    expect(listed).toMatchObject({ accessCount: 1, lastAccessedSource: `user:${t.ownerId}`, lastAccessedAt: now.toISOString() })
  })

  it('binds the ciphertext to its account id (AAD)', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const a = await createAccount(owner(), 'alpha', { service: 'A', secret: 'secret-a' })
    const b = await createAccount(owner(), 'alpha', { service: 'B', secret: 'secret-b' })
    const rowA = await rawRow(a.id)
    await t.db.update(projectAccounts).set({ secretEnc: rowA.secretEnc }).where(eq(projectAccounts.id, b.id))
    await expectCode(revealSecret(owner(), b.id), 'invalid')
    expect((await rawRow(b.id)).accessCount).toBe(0)
  })

  it('updates: undefined keeps the secret, a string re-encrypts, null clears', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const acc = await createAccount(owner(), 'alpha', { service: 'Svc', secret: 'one' })
    const before = (await rawRow(acc.id)).secretEnc

    const kept = await updateAccount(owner(), acc.id, { notes: 'hello', username: 'u' })
    expect(kept).toMatchObject({ notes: 'hello', username: 'u', hasSecret: true })
    expect((await rawRow(acc.id)).secretEnc).toBe(before)

    await updateAccount(owner(), acc.id, { secret: 'two' })
    expect((await rawRow(acc.id)).secretEnc).not.toBe(before)
    expect(await revealSecret(owner(), acc.id)).toEqual({ secret: 'two' })

    const cleared = await updateAccount(owner(), acc.id, { secret: null })
    expect(cleared.hasSecret).toBe(false)
    await expectCode(revealSecret(owner(), acc.id), 'not_found')
  })

  it('soft deletes accounts', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const acc = await createAccount(owner(), 'alpha', { service: 'Svc', secret: 'x' })
    await deleteAccount(owner(), acc.id)
    expect(await listAccounts(owner(), 'alpha')).toEqual([])
    const row = await rawRow(acc.id)
    expect(row.deletedAt).toBeInstanceOf(Date)
    expect(row.secretEnc).toBeNull()
    await expectCode(revealSecret(owner(), acc.id), 'not_found')
    await expectCode(updateAccount(owner(), acc.id, { notes: 'x' }), 'not_found')
  })

  it('needs a vault key to encrypt or decrypt', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const noKey = makeCtx(t.db, ownerActor(t.ownerId), { vaultKey: undefined })
    await expectCode(createAccount(noKey, 'alpha', { service: 'Svc', secret: 'x' }), 'invalid')
    const plain = await createAccount(noKey, 'alpha', { service: 'No secret' })
    expect(plain.hasSecret).toBe(false)
    const acc = await createAccount(owner(), 'alpha', { service: 'Svc', secret: 'x' })
    await expectCode(revealSecret(noKey, acc.id), 'invalid')
    await expectCode(revealSecret(makeCtx(t.db, ownerActor(t.ownerId), { vaultKey: 'bad' }), acc.id), 'invalid')
  })

  it('is invisible to members and MCP (except shared secrets)', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const acc = await createAccount(owner(), 'alpha', { service: 'Svc', secret: 'x', shareWithClaude: true })
    const memberId = await createMemberUser(t.db, 'guest', 50)
    const member = makeCtx(t.db, memberActor(memberId, { [p.id]: 'commenter' }))
    await expectCode(listAccounts(member, 'alpha'), 'forbidden')
    await expectCode(revealSecret(member, acc.id), 'forbidden')
    await expectCode(createAccount(member, 'alpha', { service: 'x' }), 'forbidden')
    await expectCode(listSharedSecrets(member, 'alpha'), 'forbidden')
    await expectCode(getSharedSecret(member, acc.id, 'x'), 'forbidden')

    await expectCode(listAccounts(mcp(true), 'alpha'), 'forbidden')
    await expectCode(revealSecret(mcp(true), acc.id), 'forbidden')
    await expectCode(deleteAccount(mcp(true), acc.id), 'forbidden')
  })
})

describe('shared secrets (MCP)', () => {
  async function seed() {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const shared = await createAccount(owner(), 'alpha', { service: 'Shared', username: 'bot', secret: 'shared-secret', shareWithClaude: true })
    const privateAcc = await createAccount(owner(), 'alpha', { service: 'Private', secret: 'private-secret' })
    const empty = await createAccount(owner(), 'alpha', { service: 'Empty', shareWithClaude: true })
    return { shared, privateAcc, empty }
  }

  it('is denied without allowSecrets', async () => {
    const { shared } = await seed()
    await expectCode(listSharedSecrets(mcp(false), 'alpha'), 'forbidden')
    await expectCode(getSharedSecret(mcp(false), shared.id, 'deploy'), 'forbidden')
    expect((await rawRow(shared.id)).accessCount).toBe(0)
  })

  it('lists only flagged accounts that have a secret', async () => {
    const { shared } = await seed()
    const list = await listSharedSecrets(mcp(true), 'alpha')
    expect(list.map(a => a.id)).toEqual([shared.id])
    expect(JSON.stringify(list)).not.toContain('shared-secret')
  })

  it('denies accounts not flagged "share with Claude"', async () => {
    const { privateAcc, empty } = await seed()
    await expectCode(getSharedSecret(mcp(true), privateAcc.id, 'x'), 'forbidden')
    await expectCode(getSharedSecret(mcp(true), empty.id, 'x'), 'not_found')
    expect((await rawRow(privateAcc.id)).accessCount).toBe(0)
  })

  it('returns flagged secrets and records the access with a truncated reason', async () => {
    const { shared } = await seed()
    const result = await getSharedSecret(mcp(true), shared.id, 'Run   the\nmigrations')
    expect(result).toEqual({ accountId: shared.id, service: 'Shared', username: 'bot', url: null, secret: 'shared-secret' })
    let row = await rawRow(shared.id)
    expect(row.accessCount).toBe(1)
    expect(row.lastAccessedSource).toBe('mcp:claude-repo (Run the migrations)')

    await getSharedSecret(mcp(true), shared.id, 'x'.repeat(500))
    row = await rawRow(shared.id)
    expect(row.accessCount).toBe(2)
    expect(row.lastAccessedSource).toBe(`mcp:claude-repo (${'x'.repeat(200)})`)
  })

  it('stops working once the flag is turned off or the account is deleted', async () => {
    const { shared } = await seed()
    await updateAccount(owner(), shared.id, { shareWithClaude: false })
    await expectCode(getSharedSecret(mcp(true), shared.id, 'x'), 'forbidden')
    await deleteAccount(owner(), shared.id)
    await expectCode(getSharedSecret(mcp(true), shared.id, 'x'), 'not_found')
  })
})
