import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { projectMembers, users } from '../../db/schema'
import { UNPINNED_OWNER_GITHUB_ID, getUserById, loadMemberships, resolveGithubLogin, toUserDto } from '../users'
import { createProject, deleteProject } from '../projects'
import { inviteMember, revokeMember } from '../members'
import { createTestDb, makeCtx, ownerActor } from './helpers'
import type { TestDb } from './helpers'

let t: TestDb

beforeEach(async () => {
  t = await createTestDb()
})
afterEach(() => t.cleanup())

const OWNER_CFG = { login: 'Akane' }

async function withoutOwner() {
  await t.db.delete(users)
}

async function setupProjectWithInvite(login: string, role: 'viewer' | 'commenter' = 'viewer') {
  const ctx = makeCtx(t.db, ownerActor(t.ownerId))
  const project = await createProject(ctx, { name: 'Alpha', key: 'ALP' })
  const member = await inviteMember(ctx, project.slug, { githubLogin: login, role })
  return { ctx, project, member }
}

describe('resolveGithubLogin — owner', () => {
  it('bootstraps the owner from the configured login (case-insensitive)', async () => {
    await withoutOwner()
    const user = await resolveGithubLogin(t.db, { id: 100, login: 'akane', name: 'Akane', avatarUrl: 'https://a/1.png' }, OWNER_CFG)
    expect(user?.role).toBe('owner')
    expect(user?.githubId).toBe(100)
    expect(user?.lastLoginAt).toBeInstanceOf(Date)
  })

  it('pins the owner by github id: renamed login still works, a new account with the old login does not', async () => {
    await withoutOwner()
    const first = await resolveGithubLogin(t.db, { id: 100, login: 'akane' }, OWNER_CFG)
    const renamed = await resolveGithubLogin(t.db, { id: 100, login: 'akane-renamed', name: 'New Name' }, OWNER_CFG)
    expect(renamed?.id).toBe(first?.id)
    expect(renamed?.role).toBe('owner')
    expect(renamed?.githubLogin).toBe('akane-renamed')
    expect(renamed?.name).toBe('New Name')

    const impostor = await resolveGithubLogin(t.db, { id: 999, login: 'Akane' }, OWNER_CFG)
    expect(impostor).toBeNull()
    expect(await t.db.select().from(users)).toHaveLength(1)
  })

  it('requires the configured github id when present', async () => {
    await withoutOwner()
    expect(await resolveGithubLogin(t.db, { id: 5, login: 'akane' }, { login: 'akane', githubId: '6' })).toBeNull()
    const ok = await resolveGithubLogin(t.db, { id: 6, login: 'akane' }, { login: 'akane', githubId: '6' })
    expect(ok?.role).toBe('owner')
  })

  it('matches an existing owner row by github id and ignores the configured login', async () => {
    // The seeded owner has github id 1 and login "owner".
    const user = await resolveGithubLogin(t.db, { id: 1, login: 'whatever' }, OWNER_CFG)
    expect(user?.id).toBe(t.ownerId)
    expect(user?.role).toBe('owner')
    expect(await resolveGithubLogin(t.db, { id: 2, login: 'akane' }, OWNER_CFG)).toBeNull()
  })

  it('adopts an owner row created by the dev login (github id 0) on the first real GitHub login', async () => {
    await withoutOwner()
    const [devOwner] = await t.db.insert(users)
      .values({ githubId: UNPINNED_OWNER_GITHUB_ID, githubLogin: 'akane', name: 'akane', role: 'owner' })
      .returning()
    // Someone else with a different login cannot adopt it.
    expect(await resolveGithubLogin(t.db, { id: 555, login: 'mallory' }, OWNER_CFG)).toBeNull()

    const user = await resolveGithubLogin(t.db, { id: 100, login: 'Akane', name: 'Akane R' }, OWNER_CFG)
    expect(user?.role).toBe('owner')
    expect(user?.id).toBe(devOwner?.id)
    expect(user?.githubId).toBe(100)
    expect(user?.name).toBe('Akane R')
    expect(await t.db.select().from(users)).toHaveLength(1)

    // Now pinned: the same login on another account no longer matches.
    expect(await resolveGithubLogin(t.db, { id: 101, login: 'akane' }, OWNER_CFG)).toBeNull()
    expect((await resolveGithubLogin(t.db, { id: 100, login: 'akane' }, OWNER_CFG))?.id).toBe(devOwner?.id)
  })

  it('the dev-owner adoption still honours NUXT_OWNER_GITHUB_ID', async () => {
    await withoutOwner()
    await t.db.insert(users).values({ githubId: UNPINNED_OWNER_GITHUB_ID, githubLogin: 'akane', role: 'owner' })
    expect(await resolveGithubLogin(t.db, { id: 5, login: 'akane' }, { login: 'akane', githubId: '6' })).toBeNull()
    expect((await resolveGithubLogin(t.db, { id: 6, login: 'akane' }, { login: 'akane', githubId: '6' }))?.githubId).toBe(6)
  })

  it('rejects an empty configured login and invalid profiles', async () => {
    await withoutOwner()
    expect(await resolveGithubLogin(t.db, { id: 3, login: 'x' }, { login: '' })).toBeNull()
    expect(await resolveGithubLogin(t.db, { id: 0, login: 'akane' }, OWNER_CFG)).toBeNull()
  })
})

describe('resolveGithubLogin — members', () => {
  it('accepts an invited login, links and accepts the invitation', async () => {
    const { project, member } = await setupProjectWithInvite('Guest', 'commenter')
    const user = await resolveGithubLogin(t.db, { id: 50, login: 'guest', avatarUrl: 'https://a/g.png' }, OWNER_CFG)
    expect(user?.role).toBe('member')
    const [row] = await t.db.select().from(projectMembers).where(eq(projectMembers.id, member.id))
    expect(row?.userId).toBe(user?.id)
    expect(row?.acceptedAt).toBeInstanceOf(Date)
    expect(await loadMemberships(t.db, user?.id ?? '')).toEqual({ [project.id]: 'commenter' })
  })

  it('keeps accepted_at on later logins and follows a login rename via the linked user id', async () => {
    const { member } = await setupProjectWithInvite('guest')
    const first = await resolveGithubLogin(t.db, { id: 50, login: 'guest' }, OWNER_CFG, new Date('2026-01-01T00:00:00Z'))
    const again = await resolveGithubLogin(t.db, { id: 50, login: 'guest-renamed' }, OWNER_CFG, new Date('2026-02-01T00:00:00Z'))
    expect(again?.id).toBe(first?.id)
    expect(again?.githubLogin).toBe('guest-renamed')
    const [row] = await t.db.select().from(projectMembers).where(eq(projectMembers.id, member.id))
    expect(row?.acceptedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('a new GitHub account that registers a renamed member\'s old login does not take over the invitation', async () => {
    const { project, member } = await setupProjectWithInvite('guest', 'commenter')
    const original = await resolveGithubLogin(t.db, { id: 50, login: 'guest' }, OWNER_CFG)
    expect(original).not.toBeNull()
    // The member renames their account; someone else registers the freed "guest" login.
    const attacker = await resolveGithubLogin(t.db, { id: 51, login: 'guest' }, OWNER_CFG)
    expect(attacker).toBeNull()
    expect(await t.db.select().from(users).where(eq(users.githubId, 51))).toHaveLength(0)
    const [row] = await t.db.select().from(projectMembers).where(eq(projectMembers.id, member.id))
    expect(row?.userId).toBe(original?.id)
    // The original member keeps access under the new login.
    const renamed = await resolveGithubLogin(t.db, { id: 50, login: 'guest-dev' }, OWNER_CFG)
    expect(renamed?.id).toBe(original?.id)
    expect(await loadMemberships(t.db, original?.id ?? '')).toEqual({ [project.id]: 'commenter' })
  })

  it('a linked user does not steal another project\'s invitation linked to someone else', async () => {
    const ctx = makeCtx(t.db, ownerActor(t.ownerId))
    const a = await createProject(ctx, { name: 'Alpha', key: 'ALP' })
    const b = await createProject(ctx, { name: 'Beta', key: 'BET' })
    await inviteMember(ctx, a.slug, { githubLogin: 'guest' })
    await inviteMember(ctx, b.slug, { githubLogin: 'other' })
    const other = await resolveGithubLogin(t.db, { id: 60, login: 'other' }, OWNER_CFG)
    // 60 renames away from "other"; account 50 (already a member elsewhere as "guest") renames to "other".
    await resolveGithubLogin(t.db, { id: 50, login: 'guest' }, OWNER_CFG)
    const fifty = await resolveGithubLogin(t.db, { id: 50, login: 'other' }, OWNER_CFG)
    expect(await loadMemberships(t.db, fifty?.id ?? '')).toEqual({ [a.id]: 'viewer' })
    expect(await loadMemberships(t.db, other?.id ?? '')).toEqual({ [b.id]: 'viewer' })
  })

  it('rejects an uninvited account', async () => {
    await setupProjectWithInvite('guest')
    expect(await resolveGithubLogin(t.db, { id: 77, login: 'stranger' }, OWNER_CFG)).toBeNull()
    expect(await t.db.select().from(users).where(eq(users.githubId, 77))).toHaveLength(0)
  })

  it('rejects a revoked invitation', async () => {
    const { ctx, member } = await setupProjectWithInvite('guest')
    await revokeMember(ctx, member.id)
    expect(await resolveGithubLogin(t.db, { id: 50, login: 'guest' }, OWNER_CFG)).toBeNull()
  })

  it('rejects invitations on deleted projects and drops them from memberships', async () => {
    const { ctx, project } = await setupProjectWithInvite('guest')
    const user = await resolveGithubLogin(t.db, { id: 50, login: 'guest' }, OWNER_CFG)
    await deleteProject(ctx, project.slug)
    expect(await loadMemberships(t.db, user?.id ?? '')).toEqual({})
    expect(await resolveGithubLogin(t.db, { id: 50, login: 'guest' }, OWNER_CFG)).toBeNull()
  })
})

describe('user helpers', () => {
  it('getUserById + toUserDto', async () => {
    const row = await getUserById(t.db, t.ownerId)
    expect(row).not.toBeNull()
    expect(toUserDto(row!)).toEqual({ id: t.ownerId, githubLogin: 'owner', name: 'Owner', avatarUrl: null, role: 'owner' })
    expect(await getUserById(t.db, 'missing')).toBeNull()
  })
})
