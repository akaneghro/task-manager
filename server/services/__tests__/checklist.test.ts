import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db'
import { projects } from '../../db/schema'
import type { ProjectRow } from '../../db/schema'
import type { Actor } from '../../../shared/utils/permissions'
import { ServiceError } from '../context'
import type { ServiceContext } from '../context'
import { createTask, getTask } from '../tasks'
import { addChecklistItems, deleteChecklistItem, toggleChecklistItem, updateChecklistItem } from '../checklist'
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
  ctx = ctxFor(ownerActor(t.ownerId))
})

afterEach(() => {
  t.cleanup()
})

describe('checklist', () => {
  it('appends items at the end and bumps updated_at but not version', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'T', checklist: ['first'] })
    const list = await addChecklistItems(ctx, task.key, ['second', 'third'])
    expect(list.map(i => i.text)).toEqual(['first', 'second', 'third'])
    expect(list[1]!.position).toBeGreaterThan(list[0]!.position)
    expect(list[2]!.position).toBeGreaterThan(list[1]!.position)
    const after = await getTask(ctx, task.key)
    expect(after.version).toBe(1)
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(task.updatedAt))
    expect(after.checklistTotal).toBe(3)
  })

  it('toggles by index or id idempotently without bumping the version', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'T', checklist: ['a', 'b', 'c'] })
    const mcp = ctxFor(mcpActor(t.ownerId, { tokenName: 'cc' }))
    const toggled = await toggleChecklistItem(mcp, task.key, { index: 2, done: true })
    expect(toggled.text).toBe('b')
    expect(toggled.done).toBe(true)
    expect(toggled.doneBy).toBe('mcp:cc')
    expect(toggled.doneAt).not.toBeNull()

    const afterFirst = await getTask(ctx, task.key)
    const again = await toggleChecklistItem(mcp, task.key, { itemId: toggled.id, done: true })
    expect(again).toEqual(toggled)
    const afterSecond = await getTask(ctx, task.key)
    expect(afterSecond.updatedAt).toBe(afterFirst.updatedAt)
    expect(afterSecond.version).toBe(1)
    expect(afterSecond.checklistDone).toBe(1)

    const undone = await toggleChecklistItem(ctx, task.key, { itemId: toggled.id, done: false })
    expect(undone.done).toBe(false)
    expect(undone.doneAt).toBeNull()
    expect(undone.doneBy).toBeNull()

    await expectCode(toggleChecklistItem(ctx, task.key, { index: 9, done: true }), 'not_found')
    await expectCode(toggleChecklistItem(ctx, task.key, { done: true }), 'invalid')
    const other = await createTask(ctx, { project: 'abc', title: 'Other', checklist: ['x'] })
    await expectCode(toggleChecklistItem(ctx, task.key, { itemId: other.checklist[0]!.id, done: true }), 'not_found')
  })

  it('updates text, done and position and deletes items', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'T', checklist: ['a', 'b'] })
    const [a, b] = task.checklist
    const updated = await updateChecklistItem(ctx, a!.id, { text: 'A!', done: true, position: b!.position + 1 })
    expect(updated.text).toBe('A!')
    expect(updated.done).toBe(true)
    expect((await getTask(ctx, task.key)).checklist.map(i => i.text)).toEqual(['b', 'A!'])
    await deleteChecklistItem(ctx, b!.id)
    const detail = await getTask(ctx, task.key)
    expect(detail.checklist.map(i => i.text)).toEqual(['A!'])
    expect(detail.version).toBe(1)
    await expectCode(deleteChecklistItem(ctx, b!.id), 'not_found')
    await expectCode(updateChecklistItem(ctx, a!.id, { text: '' }), 'invalid')
  })

  it('requires task.write and hides items of invisible projects', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'T', checklist: ['a'] })
    const itemId = task.checklist[0]!.id
    const memberId = await createMemberUser(t.db, 'bob', 2)
    const commenter = ctxFor(memberActor(memberId, { [abc.id]: 'commenter' }))
    await expectCode(addChecklistItems(commenter, task.key, ['x']), 'forbidden')
    await expectCode(toggleChecklistItem(commenter, task.key, { index: 1, done: true }), 'forbidden')
    await expectCode(updateChecklistItem(commenter, itemId, { done: true }), 'forbidden')
    await expectCode(deleteChecklistItem(commenter, itemId), 'forbidden')
    const stranger = ctxFor(memberActor(memberId, {}))
    await expectCode(updateChecklistItem(stranger, itemId, { done: true }), 'not_found')
  })
})
