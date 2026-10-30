import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '../../db/schema'
import { ServiceError } from '../context'
import { createProject } from '../projects'
import { inviteMember, listMembers, revokeMember, updateMember } from '../members'
import { loadMemberships, resolveGithubLogin } from '../users'
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

describe('members', () => {
  it('invites, lists, updates and revokes', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const invited = await inviteMember(owner(), 'alpha', { githubLogin: 'Guest' })
    expect(invited).toMatchObject({ projectId: p.id, githubLogin: 'Guest', role: 'viewer', userId: null, avatarUrl: null, acceptedAt: null })

    const updated = await updateMember(owner(), invited.id, { role: 'commenter' })
    expect(updated.role).toBe('commenter')

    await inviteMember(owner(), 'alpha', { githubLogin: 'another', role: 'commenter' })
    expect((await listMembers(owner(), 'alpha')).map(m => m.githubLogin)).toEqual(['another', 'Guest'])

    await revokeMember(owner(), invited.id)
    expect((await listMembers(owner(), 'alpha')).map(m => m.githubLogin)).toEqual(['another'])
    await expectCode(updateMember(owner(), invited.id, { role: 'viewer' }), 'not_found')
    await expectCode(revokeMember(owner(), invited.id), 'not_found')
  })

  it('never pre-links an invitation to a user found by a possibly stale stored login', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    // A former member whose stored login is "guest" (they may have renamed their GitHub account since).
    const userId = await createMemberUser(t.db, 'guest', 50)
    await t.db.update(users).set({ avatarUrl: 'https://avatars/g.png' }).where(eq(users.id, userId))
    const m = await inviteMember(owner(), 'alpha', { githubLogin: 'GUEST', role: 'commenter' })
    expect(m.userId).toBeNull()
    expect(m.avatarUrl).toBeNull()
    expect(await loadMemberships(t.db, userId)).toEqual({})

    // The invitation is linked when the live GitHub profile signs in with that login.
    const user = await resolveGithubLogin(t.db, { id: 50, login: 'guest' }, { login: 'akane' })
    expect(user?.id).toBe(userId)
    expect(await loadMemberships(t.db, userId)).toEqual({ [p.id]: 'commenter' })
  })

  it('reactivating a revoked invitation drops the old user link', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const first = await inviteMember(owner(), 'alpha', { githubLogin: 'bob' })
    const oldUser = await resolveGithubLogin(t.db, { id: 70, login: 'bob' }, { login: 'akane' })
    expect(oldUser).not.toBeNull()
    await revokeMember(owner(), first.id)
    const again = await inviteMember(owner(), 'alpha', { githubLogin: 'bob' })
    expect(again.userId).toBeNull()
    expect(await loadMemberships(t.db, oldUser?.id ?? '')).toEqual({})
    expect(p.id).toBe(again.projectId)
  })

  it('reactivates a revoked login instead of creating a new row', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const first = await inviteMember(owner(), 'alpha', { githubLogin: 'guest' })
    await revokeMember(owner(), first.id)
    const again = await inviteMember(owner(), 'alpha', { githubLogin: 'Guest', role: 'commenter' })
    expect(again.id).toBe(first.id)
    expect(again.role).toBe('commenter')
    expect(again.githubLogin).toBe('Guest')
    expect(await listMembers(owner(), 'alpha')).toHaveLength(1)
  })

  it('rejects duplicate active invitations, the owner login and invalid logins', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await inviteMember(owner(), 'alpha', { githubLogin: 'guest' })
    await expectCode(inviteMember(owner(), 'alpha', { githubLogin: 'GUEST' }), 'conflict')
    await expectCode(inviteMember(owner(), 'alpha', { githubLogin: 'Owner' }), 'invalid')
    await expectCode(inviteMember(owner(), 'alpha', { githubLogin: 'bad login!' }), 'invalid')
  })

  it('requires project.manage (owner only)', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const m = await inviteMember(owner(), 'alpha', { githubLogin: 'guest' })
    const mcp = makeCtx(t.db, mcpActor(t.ownerId))
    await expectCode(listMembers(mcp, 'alpha'), 'forbidden')
    await expectCode(inviteMember(mcp, 'alpha', { githubLogin: 'x' }), 'forbidden')
    await expectCode(updateMember(mcp, m.id, { role: 'commenter' }), 'forbidden')
    await expectCode(revokeMember(mcp, m.id), 'forbidden')

    const userId = await createMemberUser(t.db, 'commenter1', 60)
    const member = makeCtx(t.db, memberActor(userId, { [p.id]: 'commenter' }))
    await expectCode(listMembers(member, 'alpha'), 'forbidden')
    // A member of another project cannot even learn the member id exists.
    const outsider = makeCtx(t.db, memberActor(userId, {}))
    await expectCode(revokeMember(outsider, m.id), 'not_found')
  })
})
