import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db'
import { projects } from '../../db/schema'
import type { ProjectRow } from '../../db/schema'
import type { Actor } from '../../../shared/utils/permissions'
import { ServiceError } from '../context'
import type { ServiceContext } from '../context'
import { createTask, deleteTask, getTask } from '../tasks'
import { addBlockedBy, deleteTaskLink, removeBlockedBy } from '../taskLinks'
import { createMemberUser, createTestDb, makeCtx, mcpActor, memberActor, ownerActor } from './helpers'
import type { TestDb } from './helpers'

async function insertProject(db: Db, slug: string, key: string): Promise<ProjectRow> {
  const [row] = await db.insert(projects).values({ slug, key, name: slug, createdBy: 'test', updatedBy: 'test' }).returning()
  if (!row) throw new Error('project insert failed')
  return row
}

async function expectCode(promise: Promise<unknown>, code: ServiceError['code']): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ServiceError)
  await expect(promise).rejects.toMatchObject({ code })
}

let t: TestDb
let abc: ProjectRow
let tick: number
let ctx: ServiceContext
const ctxFor = (actor: Actor) => makeCtx(t.db, actor, { now: () => new Date((tick += 1000)) })

beforeEach(async () => {
  t = await createTestDb()
  tick = Date.parse('2026-01-01T00:00:00Z')
  abc = await insertProject(t.db, 'abc', 'ABC')
  await insertProject(t.db, 'xyz', 'XYZ')
  ctx = ctxFor(ownerActor(t.ownerId))
})

afterEach(() => {
  t.cleanup()
})

describe('task links', () => {
  it('adds blockers (idempotent), lists both directions and removes them', async () => {
    const a = await createTask(ctx, { project: 'abc', title: 'A' })
    const b = await createTask(ctx, { project: 'abc', title: 'B' })
    const detail = await addBlockedBy(ctx, b.key, a.key.toLowerCase())
    expect(detail.blockedBy.map(r => r.key)).toEqual(['ABC-1'])
    expect(detail.blockedByKeys).toEqual(['ABC-1'])
    expect(detail.version).toBe(1)
    const again = await addBlockedBy(ctx, b.key, a.key)
    expect(again.blockedBy).toHaveLength(1)
    expect((await getTask(ctx, a.key)).blocking.map(r => r.key)).toEqual(['ABC-2'])

    const removed = await removeBlockedBy(ctx, b.key, a.key)
    expect(removed.blockedBy).toEqual([])
    const noop = await removeBlockedBy(ctx, b.key, a.key)
    expect(noop.blockedBy).toEqual([])
  })

  it('rejects self links and cycles (A blocks B, B blocks A)', async () => {
    const a = await createTask(ctx, { project: 'abc', title: 'A' })
    const b = await createTask(ctx, { project: 'abc', title: 'B' })
    const c = await createTask(ctx, { project: 'abc', title: 'C' })
    await expectCode(addBlockedBy(ctx, a.key, a.key), 'invalid')
    await addBlockedBy(ctx, b.key, a.key) // A blocks B
    await expectCode(addBlockedBy(ctx, a.key, b.key), 'invalid') // B blocks A -> cycle
    await addBlockedBy(ctx, c.key, b.key) // B blocks C
    await expectCode(addBlockedBy(ctx, a.key, c.key), 'invalid') // C blocks A -> A->B->C->A
    await expectCode(createTask(ctx, { project: 'abc', title: 'D', blockedBy: ['ABC-99'] }), 'not_found')
  })

  it('supports cross-project links and deletion by link id', async () => {
    const a = await createTask(ctx, { project: 'xyz', title: 'Other project' })
    const b = await createTask(ctx, { project: 'abc', title: 'B' })
    const detail = await addBlockedBy(ctx, b.key, a.key)
    const link = detail.blockedBy[0]
    expect(link?.projectSlug).toBe('xyz')
    await deleteTaskLink(ctx, link!.linkId)
    expect((await getTask(ctx, b.key)).blockedBy).toEqual([])
    await expectCode(deleteTaskLink(ctx, link!.linkId), 'not_found')
  })

  it('requires task.write on both projects', async () => {
    const a = await createTask(ctx, { project: 'xyz', title: 'Other project' })
    const b = await createTask(ctx, { project: 'abc', title: 'B' })
    const memberId = await createMemberUser(t.db, 'bob', 2)
    const member = ctxFor(memberActor(memberId, { [abc.id]: 'commenter' }))
    await expectCode(addBlockedBy(member, b.key, a.key), 'not_found')
    await expectCode(addBlockedBy(member, b.key, b.key), 'forbidden')

    const mcp = ctxFor(mcpActor(t.ownerId))
    const detail = await addBlockedBy(mcp, b.key, a.key)
    expect(detail.blockedBy).toHaveLength(1)
    await expectCode(deleteTaskLink(member, detail.blockedBy[0]!.linkId), 'not_found')
  })

  it('ignores deleted blockers', async () => {
    const a = await createTask(ctx, { project: 'abc', title: 'A' })
    const b = await createTask(ctx, { project: 'abc', title: 'B', blockedBy: [a.key] })
    expect(b.blockedByKeys).toEqual([a.key])
    await deleteTask(ctx, a.key)
    const detail = await getTask(ctx, b.key)
    expect(detail.blockedBy).toEqual([])
    expect(detail.blockedByKeys).toEqual([])
    expect(detail.hiddenDependencies).toBe(0)
  })
})
