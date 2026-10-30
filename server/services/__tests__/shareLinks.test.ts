import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { shareLinks, tasks } from '../../db/schema'
import type { TaskStatus } from '../../../shared/utils/enums'
import type { Actor } from '../../../shared/utils/permissions'
import { ServiceError } from '../context'
import { createProject, deleteProject } from '../projects'
import { createShareLink, getPublicProject, listShareLinks, resolveShareToken, revokeShareLink } from '../shareLinks'
import { createTestDb, makeCtx, mcpActor, ownerActor, TEST_SITE_URL } from './helpers'
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

async function insertTask(projectId: string, number: number, status: TaskStatus, deleted = false) {
  await t.db.insert(tasks).values({
    projectId,
    number,
    title: `Task ${number}`,
    status,
    position: number,
    createdBy: 'test',
    updatedBy: 'test',
    deletedAt: deleted ? new Date() : null,
  })
}

describe('share links', () => {
  it('creates, lists and revokes links', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const link = await createShareLink(owner(), 'alpha', { label: 'Client' })
    expect(link.projectId).toBe(p.id)
    expect(link.token).toMatch(/^[\w-]{32}$/)
    expect(link.url).toBe(`${TEST_SITE_URL}/s/${link.token}`)
    expect(link.label).toBe('Client')
    const unlabeled = await createShareLink(owner(), 'alpha', {})
    expect(unlabeled.label).toBeNull()

    expect(await listShareLinks(owner(), 'alpha')).toHaveLength(2)
    await revokeShareLink(owner(), link.id)
    expect((await listShareLinks(owner(), 'alpha')).map(l => l.id)).toEqual([unlabeled.id])
    await expectCode(revokeShareLink(owner(), link.id), 'not_found')
  })

  it('is owner only', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const link = await createShareLink(owner(), 'alpha', {})
    const mcp = makeCtx(t.db, mcpActor(t.ownerId))
    await expectCode(listShareLinks(mcp, 'alpha'), 'forbidden')
    await expectCode(createShareLink(mcp, 'alpha', {}), 'forbidden')
    await expectCode(revokeShareLink(mcp, link.id), 'forbidden')
  })

  it('resolves active tokens, throttles last_used_at and stops after revoke', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const link = await createShareLink(owner(), 'alpha', {})
    const t0 = new Date('2026-05-01T10:00:00Z')

    expect(await resolveShareToken(t.db, link.token, t0)).toEqual({ shareLinkId: link.id, projectId: p.id })
    const lastUsed = async () => (await t.db.select().from(shareLinks).where(eq(shareLinks.id, link.id)))[0]?.lastUsedAt?.getTime()
    expect(await lastUsed()).toBe(t0.getTime())
    await resolveShareToken(t.db, link.token, new Date(t0.getTime() + 30_000))
    expect(await lastUsed()).toBe(t0.getTime())
    const t2 = new Date(t0.getTime() + 61_000)
    await resolveShareToken(t.db, link.token, t2)
    expect(await lastUsed()).toBe(t2.getTime())

    expect(await resolveShareToken(t.db, 'unknown-token')).toBeNull()
    expect(await resolveShareToken(t.db, '')).toBeNull()
    await revokeShareLink(owner(), link.id)
    expect(await resolveShareToken(t.db, link.token)).toBeNull()
  })

  it('does not resolve links of deleted projects', async () => {
    await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    const link = await createShareLink(owner(), 'alpha', {})
    await deleteProject(owner(), 'alpha')
    expect(await resolveShareToken(t.db, link.token)).toBeNull()
  })
})

describe('getPublicProject', () => {
  it('returns the project and its tasks without notes, links, client or capabilities', async () => {
    const p = await createProject(owner(), {
      name: 'Alpha',
      key: 'ALP',
      client: 'ACME',
      notes: 'very private notes',
      links: [{ label: 'Repo', url: 'https://github.com/a/b' }],
    })
    await insertTask(p.id, 1, 'todo')
    await insertTask(p.id, 2, 'done')
    await insertTask(p.id, 3, 'in_progress', true)

    const link = await createShareLink(owner(), 'alpha', {})
    const resolved = await resolveShareToken(t.db, link.token)
    expect(resolved).not.toBeNull()
    const actor: Actor = { kind: 'public', projectId: resolved?.projectId ?? '', shareLinkId: resolved?.shareLinkId ?? '', source: `public:${resolved?.shareLinkId}` }
    const dto = await getPublicProject(makeCtx(t.db, actor))

    expect(dto.project).toMatchObject({ id: p.id, slug: 'alpha', key: 'ALP', client: null })
    expect(dto.project.capabilities).toBeUndefined()
    expect('notes' in dto.project).toBe(false)
    expect(dto.links).toEqual([])
    expect(dto.tasks.map(task => task.key)).toEqual(['ALP-1', 'ALP-2'])
    expect(dto.project.counts).toMatchObject({ todo: 1, done: 1, in_progress: 0 })
    expect(JSON.stringify(dto)).not.toContain('very private notes')
    expect(JSON.stringify(dto)).not.toContain('ACME')
    expect(JSON.stringify(dto)).not.toContain('github.com/a/b')
  })

  it('does not expose actor sources (token names, user ids) in public task summaries', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await t.db.insert(tasks).values({
      projectId: p.id,
      number: 1,
      title: 'By Claude',
      status: 'todo',
      position: 1,
      createdBy: 'mcp:laptop-token-name',
      updatedBy: `user:${t.ownerId}`,
    })
    const link = await createShareLink(owner(), 'alpha', {})
    const resolved = await resolveShareToken(t.db, link.token)
    const actor: Actor = { kind: 'public', projectId: resolved?.projectId ?? '', shareLinkId: resolved?.shareLinkId ?? '', source: `public:${resolved?.shareLinkId}` }
    const dto = await getPublicProject(makeCtx(t.db, actor))
    const json = JSON.stringify(dto)
    expect(json).not.toContain('laptop-token-name')
    expect(json).not.toContain(t.ownerId)
    expect(dto.tasks[0]).toMatchObject({ createdBy: 'mcp:', updatedBy: 'user:' })
  })

  it('requires a public actor', async () => {
    await expectCode(getPublicProject(owner()), 'forbidden')
  })

  it('returns not_found for a deleted project', async () => {
    const p = await createProject(owner(), { name: 'Alpha', key: 'ALP' })
    await deleteProject(owner(), 'alpha')
    const actor: Actor = { kind: 'public', projectId: p.id, shareLinkId: 'x', source: 'public:x' }
    await expectCode(getPublicProject(makeCtx(t.db, actor)), 'not_found')
  })
})
