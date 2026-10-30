import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db'
import { projects } from '../../db/schema'
import type { ProjectRow } from '../../db/schema'
import type { Actor } from '../../../shared/utils/permissions'
import { ServiceError } from '../context'
import type { ServiceContext } from '../context'
import { createTask, deleteTask, updateTask } from '../tasks'
import { addComment } from '../comments'
import { toggleChecklistItem } from '../checklist'
import { getLastChange } from '../sync'
import { createMemberUser, createTestDb, makeCtx, memberActor, ownerActor, publicActor } from './helpers'
import type { TestDb } from './helpers'

const BASE = Date.parse('2026-01-01T00:00:00Z')

async function insertProject(db: Db, slug: string, key: string): Promise<ProjectRow> {
  const at = new Date(BASE)
  const [row] = await db.insert(projects).values({ slug, key, name: slug, createdBy: 'test', updatedBy: 'test', createdAt: at, updatedAt: at }).returning()
  if (!row) throw new Error('project insert failed')
  return row
}

let t: TestDb
let abc: ProjectRow
let tick: number
let ctx: ServiceContext
const ctxFor = (actor: Actor) => makeCtx(t.db, actor, { now: () => new Date((tick += 1000)) })
const last = async (c: ServiceContext, slug?: string) => {
  const { lastChange } = await getLastChange(c, slug)
  return lastChange === null ? null : Date.parse(lastChange)
}

beforeEach(async () => {
  t = await createTestDb()
  tick = BASE
  abc = await insertProject(t.db, 'abc', 'ABC')
  await insertProject(t.db, 'xyz', 'XYZ')
  ctx = ctxFor(ownerActor(t.ownerId))
})

afterEach(() => {
  t.cleanup()
})

describe('getLastChange', () => {
  it('moves after creates, updates, deletes, checklist and comment changes', async () => {
    expect(await last(ctx)).toBe(BASE)
    const task = await createTask(ctx, { project: 'abc', title: 'T', checklist: ['a'] })
    const afterCreate = await last(ctx)
    expect(afterCreate).toBe(Date.parse(task.updatedAt))

    await updateTask(ctx, task.key, { expectedVersion: 1, patch: { title: 'T2' } })
    const afterUpdate = await last(ctx)
    expect(afterUpdate).toBeGreaterThan(afterCreate!)

    await toggleChecklistItem(ctx, task.key, { index: 1, done: true })
    const afterToggle = await last(ctx)
    expect(afterToggle).toBeGreaterThan(afterUpdate!)

    await addComment(ctx, task.key, 'hi')
    const afterComment = await last(ctx)
    expect(afterComment).toBeGreaterThan(afterToggle!)

    await deleteTask(ctx, task.key)
    const afterDelete = await last(ctx)
    expect(afterDelete).toBeGreaterThan(afterComment!)
    expect(await last(ctx, 'abc')).toBe(afterDelete)
  })

  it('scopes to a project and to what the actor can see', async () => {
    await createTask(ctx, { project: 'abc', title: 'A' })
    const inXyz = await createTask(ctx, { project: 'xyz', title: 'X' })
    const abcLast = await last(ctx, 'abc')
    expect(await last(ctx, 'xyz')).toBe(Date.parse(inXyz.updatedAt))
    expect(abcLast).toBeLessThan(Date.parse(inXyz.updatedAt))

    const memberId = await createMemberUser(t.db, 'bob', 2)
    const member = ctxFor(memberActor(memberId, { [abc.id]: 'viewer' }))
    expect(await last(member)).toBe(abcLast)
    await expect(getLastChange(member, 'xyz')).rejects.toBeInstanceOf(ServiceError)

    expect(await last(ctxFor(publicActor(abc.id)))).toBe(abcLast)
    expect(await last(ctxFor(memberActor(memberId, {})))).toBeNull()
  })
})
