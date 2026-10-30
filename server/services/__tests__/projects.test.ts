import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { projects, tasks } from '../../db/schema'
import type { TaskStatus } from '../../../shared/utils/enums'
import { can } from '../../../shared/utils/permissions'
import type { ProjectDetailDto } from '../../../shared/types/dto'
import { ServiceError } from '../context'
import {
  createProject,
  deleteProject,
  ensureInbox,
  getProject,
  listProjects,
  replaceProjectLinks,
  updateProject,
  updateProjectNotes,
} from '../projects'
import { createMemberUser, createTestDb, makeCtx, mcpActor, memberActor, ownerActor, publicActor } from './helpers'
import type { TestDb } from './helpers'

let t: TestDb

beforeEach(async () => {
  t = await createTestDb()
})
afterEach(() => t.cleanup())

const owner = () => makeCtx(t.db, ownerActor(t.ownerId))

async function insertTask(projectId: string, number: number, status: TaskStatus, deleted = false) {
  await t.db.insert(tasks).values({
    projectId,
    number,
    title: `Task ${number}`,
    status,
    createdBy: 'test',
    updatedBy: 'test',
    deletedAt: deleted ? new Date() : null,
  })
}

async function expectServiceError(promise: Promise<unknown>, code: ServiceError['code']): Promise<ServiceError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(ServiceError)
  expect((error as ServiceError).code).toBe(code)
  return error as ServiceError
}

describe('ensureInbox', () => {
  it('is idempotent', async () => {
    const a = await ensureInbox(t.db)
    const b = await ensureInbox(t.db)
    expect(a.id).toBe(b.id)
    expect(a).toMatchObject({ slug: 'inbox', key: 'INBOX', isInbox: true, status: 'development', createdBy: 'system' })
    expect(await t.db.select().from(projects)).toHaveLength(1)
  })
})

describe('createProject', () => {
  it('derives the slug from the name and stores links in order', async () => {
    const p = await createProject(owner(), {
      name: 'Renkia Web App!',
      key: 'rnk',
      client: 'ACME',
      links: [
        { kind: 'repo', label: 'GitHub', url: 'https://github.com/x/y' },
        { label: 'Docs', url: 'https://docs.example.com' },
      ],
    })
    expect(p).toMatchObject({ slug: 'renkia-web-app', key: 'RNK', status: 'idea', client: 'ACME', version: 1, isInbox: false })
    expect(p.links.map(l => [l.label, l.kind, l.position])).toEqual([['GitHub', 'repo', 0], ['Docs', 'other', 1]])
    expect(p.createdBy).toBe(`user:${t.ownerId}`)
    expect(p.capabilities).toEqual({ edit: true, comment: true, manage: true, vault: true })
  })

  it('rejects duplicate slugs and keys with a conflict', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const slugErr = await expectServiceError(createProject(owner(), { name: 'Alpha', key: 'ALQ' }), 'conflict')
    expect(slugErr.message).toContain('alpha')
    const keyErr = await expectServiceError(createProject(owner(), { name: 'Beta', key: 'alp' }), 'conflict')
    expect(keyErr.message).toContain('ALP')
  })

  it('keeps slugs of deleted projects reserved with a clear message', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await deleteProject(owner(), 'alpha')
    const err = await expectServiceError(createProject(owner(), { name: 'Alpha', key: 'ALQ' }), 'conflict')
    expect(err.message).toMatch(/deleted/)
  })

  it('rejects the reserved Inbox slug/key and underivable slugs', async () => {
    await expectServiceError(createProject(owner(), { name: 'Inbox', key: 'INB' }), 'invalid')
    await expectServiceError(createProject(owner(), { name: 'Other', key: 'INBOX' }), 'invalid')
    await expectServiceError(createProject(owner(), { name: '!!!', key: 'EXC' }), 'invalid')
    await expectServiceError(createProject(owner(), { name: '', key: 'EXC' }), 'invalid')
  })

  it('reserves the "all" slug (it means every project in listings and sync)', async () => {
    await expectServiceError(createProject(owner(), { name: 'All', key: 'ALL' }), 'invalid')
    await expectServiceError(createProject(owner(), { name: 'Everything', key: 'EVR', slug: 'all' }), 'invalid')
    await createProject(owner(), { name: 'Beta', key: 'BET' })
    await expectServiceError(updateProject(owner(), 'beta', { expectedVersion: 1, slug: 'all' }), 'invalid')
  })

  it('is allowed for MCP but not for members', async () => {
    const mcp = makeCtx(t.db, mcpActor(t.ownerId))
    const p = await createProject(mcp, { name: 'From Claude', key: 'FC' })
    expect(p.createdBy).toBe('mcp:test-token')
    const memberId = await createMemberUser(t.db, 'guest', 50)
    await expectServiceError(createProject(makeCtx(t.db, memberActor(memberId, {})), { name: 'X', key: 'XX' }), 'forbidden')
  })
})

describe('listProjects', () => {
  it('puts the Inbox first, orders by status then name, hides archived unless asked, counts tasks', async () => {
    await ensureInbox(t.db)
    const zeta = await createProject(owner(), { name: 'Zeta', key: 'ZET', status: 'development' })
    await createProject(owner(), { name: 'alpha', key: 'ALP', status: 'production' })
    await createProject(owner(), { name: 'Beta', key: 'BET', status: 'development' })
    await createProject(owner(), { name: 'Idea', key: 'IDE', status: 'idea' })
    await createProject(owner(), { name: 'Old', key: 'OLD', status: 'archived' })
    await insertTask(zeta.id, 1, 'todo')
    await insertTask(zeta.id, 2, 'done')
    await insertTask(zeta.id, 3, 'in_progress')
    await insertTask(zeta.id, 4, 'todo', true)

    const list = await listProjects(owner())
    expect(list.map(p => p.slug)).toEqual(['inbox', 'idea', 'beta', 'zeta', 'alpha'])
    const z = list.find(p => p.slug === 'zeta')
    expect(z?.counts).toMatchObject({ todo: 1, done: 1, in_progress: 1 })
    expect(z?.openCount).toBe(2)
    expect(z?.capabilities?.manage).toBe(true)

    expect((await listProjects(owner(), { includeArchived: true })).map(p => p.slug)).toContain('old')
    expect((await listProjects(owner(), { status: ['archived', 'idea'] })).map(p => p.slug)).toEqual(['idea', 'old'])
  })

  it('shows members only their invited projects, with read-only capabilities', async () => {
    const a = await createProject(owner(), { name: 'Alpha', key: 'ALP', client: 'ACME', notes: 'secret plan' })
    const b = await createProject(owner(), { name: 'Beta', key: 'BET' })
    await createProject(owner(), { name: 'Gamma', key: 'GAM' })
    const memberId = await createMemberUser(t.db, 'guest', 50)
    const actor = memberActor(memberId, { [a.id]: 'viewer', [b.id]: 'commenter' })
    const ctx = makeCtx(t.db, actor)

    const list = await listProjects(ctx)
    expect(list.map(p => p.slug)).toEqual(['alpha', 'beta'])
    expect(list[0]?.capabilities).toEqual({ edit: false, comment: false, manage: false, vault: false })
    expect(list[1]?.capabilities?.comment).toBe(true)

    const detail = await getProject(ctx, 'alpha')
    expect(detail.notes).toBe('secret plan')
    expect(detail.client).toBe('ACME')
    await expectServiceError(getProject(ctx, 'gamma'), 'not_found')

    expect(can(actor, 'comment.write', { projectId: a.id })).toBe(false)
    expect(can(actor, 'comment.write', { projectId: b.id })).toBe(true)
    expect(can(actor, 'task.write', { projectId: b.id })).toBe(false)
  })

  it('is not available to public links', async () => {
    const a = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await expectServiceError(listProjects(makeCtx(t.db, publicActor(a.id))), 'forbidden')
  })
})

describe('getProject', () => {
  it('hides notes, links and client from public actors', async () => {
    const a = await createProject(owner(), {
      name: 'Alpha',
      key: 'ALP',
      client: 'ACME',
      notes: 'private',
      links: [{ label: 'Repo', url: 'https://github.com/x/y' }],
    })
    const pub = await getProject(makeCtx(t.db, publicActor(a.id)), 'alpha')
    expect(pub.notes).toBe('')
    expect(pub.links).toEqual([])
    expect(pub.client).toBeNull()
    expect(pub.capabilities).toBeUndefined()
  })

  it('returns not_found for unknown or deleted projects', async () => {
    await expectServiceError(getProject(owner(), 'nope'), 'not_found')
  })
})

describe('updateProject', () => {
  it('updates fields and bumps the version', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const updated = await updateProject(owner(), 'alpha', { expectedVersion: 1, name: 'Alpha 2', slug: 'alpha-two', status: 'production', client: null })
    expect(updated).toMatchObject({ name: 'Alpha 2', slug: 'alpha-two', status: 'production', version: 2, key: 'ALP' })
    await expectServiceError(getProject(owner(), 'alpha'), 'not_found')
  })

  it('returns a conflict carrying the current detail on a stale version', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await updateProject(owner(), 'alpha', { expectedVersion: 1, description: 'v2' })
    const err = await expectServiceError(updateProject(owner(), 'alpha', { expectedVersion: 1, description: 'stale' }), 'conflict')
    const current = err.details as ProjectDetailDto
    expect(current.version).toBe(2)
    expect(current.description).toBe('v2')
  })

  it('rejects slug collisions', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await createProject(owner(), { name: 'Beta', key: 'BET' })
    await expectServiceError(updateProject(owner(), 'beta', { expectedVersion: 1, slug: 'alpha' }), 'conflict')
    await expectServiceError(updateProject(owner(), 'beta', { expectedVersion: 1, slug: 'inbox' }), 'invalid')
  })

  it('protects the Inbox slug and status', async () => {
    await ensureInbox(t.db)
    await expectServiceError(updateProject(owner(), 'inbox', { expectedVersion: 1, slug: 'box' }), 'invalid')
    await expectServiceError(updateProject(owner(), 'inbox', { expectedVersion: 1, status: 'archived' }), 'invalid')
    const ok = await updateProject(owner(), 'inbox', { expectedVersion: 1, slug: 'inbox', description: 'quick capture' })
    expect(ok.description).toBe('quick capture')
  })

  it('is owner only', async () => {
    const a = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await expectServiceError(updateProject(makeCtx(t.db, mcpActor(t.ownerId)), 'alpha', { expectedVersion: 1, name: 'x' }), 'forbidden')
    const memberId = await createMemberUser(t.db, 'guest', 50)
    const member = makeCtx(t.db, memberActor(memberId, { [a.id]: 'commenter' }))
    await expectServiceError(updateProject(member, 'alpha', { expectedVersion: 1, name: 'x' }), 'forbidden')
  })
})

describe('updateProjectNotes', () => {
  it('appends with a blank-line separator and bumps the version', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const mcp = makeCtx(t.db, mcpActor(t.ownerId))
    const first = await updateProjectNotes(mcp, 'alpha', { mode: 'append', content: 'first' })
    expect(first.notes).toBe('first')
    expect(first.version).toBe(2)
    expect(first.updatedBy).toBe('mcp:test-token')
    const second = await updateProjectNotes(mcp, 'alpha', { mode: 'append', content: 'second' })
    expect(second.notes).toBe('first\n\nsecond')
    expect(second.version).toBe(3)
  })

  it('replace requires the current version', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP', notes: 'old' })
    await expectServiceError(updateProjectNotes(owner(), 'alpha', { mode: 'replace', content: 'x' }), 'invalid')
    const err = await expectServiceError(updateProjectNotes(owner(), 'alpha', { mode: 'replace', content: 'x', expectedVersion: 7 }), 'conflict')
    expect((err.details as ProjectDetailDto).notes).toBe('old')
    const ok = await updateProjectNotes(owner(), 'alpha', { mode: 'replace', content: 'new', expectedVersion: 1 })
    expect(ok.notes).toBe('new')
    expect(ok.version).toBe(2)
  })

  it('is forbidden for members', async () => {
    const a = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const memberId = await createMemberUser(t.db, 'guest', 50)
    const member = makeCtx(t.db, memberActor(memberId, { [a.id]: 'commenter' }))
    await expectServiceError(updateProjectNotes(member, 'alpha', { mode: 'append', content: 'x' }), 'forbidden')
  })
})

describe('replaceProjectLinks', () => {
  it('replaces all links in order and is visible to members', async () => {
    const a = await createProject(owner(), { name: 'Alpha', key: 'ALP', links: [{ label: 'Old', url: 'https://old.example.com' }] })
    const links = await replaceProjectLinks(makeCtx(t.db, mcpActor(t.ownerId)), 'alpha', [
      { kind: 'prod', label: 'Prod', url: 'https://prod.example.com' },
      { kind: 'repo', label: 'Repo', url: 'https://github.com/a/b' },
    ])
    expect(links.map(l => [l.label, l.position])).toEqual([['Prod', 0], ['Repo', 1]])
    const memberId = await createMemberUser(t.db, 'guest', 50)
    const member = makeCtx(t.db, memberActor(memberId, { [a.id]: 'viewer' }))
    expect((await getProject(member, 'alpha')).links.map(l => l.label)).toEqual(['Prod', 'Repo'])
    await expectServiceError(replaceProjectLinks(member, 'alpha', []), 'forbidden')
  })

  it('validates link urls', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await expectServiceError(replaceProjectLinks(owner(), 'alpha', [{ kind: 'other', label: 'x', url: 'javascript:alert(1)' }]), 'invalid')
  })
})

describe('deleteProject', () => {
  it('soft deletes, hides the project and forbids deleting the Inbox', async () => {
    await ensureInbox(t.db)
    const a = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await deleteProject(owner(), 'alpha')
    const [row] = await t.db.select().from(projects).where(eq(projects.id, a.id))
    expect(row?.deletedAt).toBeInstanceOf(Date)
    expect((await listProjects(owner())).map(p => p.slug)).toEqual(['inbox'])
    await expectServiceError(deleteProject(owner(), 'inbox'), 'forbidden')
  })

  it('is forbidden for MCP tokens', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await expectServiceError(deleteProject(makeCtx(t.db, mcpActor(t.ownerId)), 'alpha'), 'forbidden')
  })
})
