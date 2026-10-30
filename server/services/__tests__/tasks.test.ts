import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db'
import { projects, tasks } from '../../db/schema'
import type { ProjectRow } from '../../db/schema'
import { listTasksQuerySchema } from '../../../shared/schemas/task'
import type { ListTasksQueryInput } from '../../../shared/schemas/task'
import type { Actor } from '../../../shared/utils/permissions'
import type { TaskDetailDto } from '../../../shared/types/dto'
import { ServiceError } from '../context'
import type { ServiceContext } from '../context'
import {
  createTask,
  deleteTask,
  getProjectContext,
  getTask,
  listTasks,
  moveTask,
  resolveTaskRef,
  searchTasks,
  setTaskStatus,
  updateTask,
} from '../tasks'
import { addComment } from '../comments'
import { addChecklistItems } from '../checklist'
import { addBlockedBy } from '../taskLinks'
import {
  createMemberUser,
  createTestDb,
  makeCtx,
  mcpActor,
  memberActor,
  ownerActor,
  publicActor,
} from './helpers'
import type { TestDb } from './helpers'

async function insertProject(db: Db, slug: string, key: string, extra: Partial<typeof projects.$inferInsert> = {}): Promise<ProjectRow> {
  const [row] = await db.insert(projects).values({ slug, key, name: slug.toUpperCase(), createdBy: 'test', updatedBy: 'test', ...extra }).returning()
  if (!row) throw new Error('project insert failed')
  return row
}

async function expectServiceError(promise: Promise<unknown>, code: ServiceError['code']): Promise<ServiceError> {
  try {
    await promise
  }
  catch (error) {
    expect(error).toBeInstanceOf(ServiceError)
    const serviceError = error as ServiceError
    expect(serviceError.code).toBe(code)
    return serviceError
  }
  throw new Error(`Expected ServiceError(${code})`)
}

function query(input: ListTasksQueryInput = {}) {
  return listTasksQuerySchema.parse(input)
}

let t: TestDb
let inbox: ProjectRow
let abc: ProjectRow
let tick: number
const clock = () => new Date((tick += 1000))
let ctx: ServiceContext
const ctxFor = (actor: Actor) => makeCtx(t.db, actor, { now: clock })

beforeEach(async () => {
  t = await createTestDb()
  tick = Date.parse('2026-01-01T00:00:00Z')
  inbox = await insertProject(t.db, 'inbox', 'INBOX', { isInbox: true, name: 'Inbox' })
  abc = await insertProject(t.db, 'abc', 'ABC')
  ctx = ctxFor(ownerActor(t.ownerId))
})

afterEach(() => {
  t.cleanup()
})

describe('createTask', () => {
  it('allocates sequential keys per project and defaults to the Inbox', async () => {
    const a = await createTask(ctx, { project: 'abc', title: 'One' })
    const b = await createTask(ctx, { project: 'abc', title: 'Two' })
    const c = await createTask(ctx, { title: 'Inbox item' })
    expect([a.key, b.key, c.key]).toEqual(['ABC-1', 'ABC-2', 'INBOX-1'])
    expect(a.version).toBe(1)
    expect(a.createdBy).toBe(`user:${t.ownerId}`)
    expect(c.projectId).toBe(inbox.id)
    expect(b.position).toBeGreaterThan(a.position)
  })

  it('allocates unique numbers under concurrent creates', async () => {
    const created = await Promise.all(Array.from({ length: 10 }, (_, i) => createTask(ctx, { project: 'abc', title: `T${i}` })))
    const numbers = created.map(c => c.number).sort((x, y) => x - y)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const [project] = await t.db.select().from(projects).where(eq(projects.id, abc.id))
    expect(project?.nextTaskNumber).toBe(11)
  })

  it('uses the MCP default project and records the token source', async () => {
    const mcp = ctxFor(mcpActor(t.ownerId, { defaultProject: 'abc', tokenName: 'laptop' }))
    const task = await createTask(mcp, { title: 'From Claude' })
    expect(task.key).toBe('ABC-1')
    expect(task.createdBy).toBe('mcp:laptop')
  })

  it('stores assignee, blocker, checklist, blockedBy and completed_at', async () => {
    const memberId = await createMemberUser(t.db, 'alice', 2)
    const blocker = await createTask(ctx, { project: 'abc', title: 'Blocker' })
    const task = await createTask(ctx, {
      project: 'abc',
      title: 'Full',
      status: 'done',
      assignee: { kind: 'member', userId: memberId },
      blocker: { who: 'Client', what: 'Logo' },
      checklist: ['a', 'b'],
      blockedBy: [blocker.key.toLowerCase()],
    })
    expect(task.assignee).toEqual({ kind: 'member', userId: memberId, name: 'alice' })
    expect(task.blocker).toEqual({ who: 'Client', what: 'Logo', since: '2026-01-01' })
    expect(task.checklist.map(i => i.text)).toEqual(['a', 'b'])
    expect(task.checklistTotal).toBe(2)
    expect(task.blockedBy.map(b => b.key)).toEqual(['ABC-1'])
    expect(task.blockedByKeys).toEqual(['ABC-1'])
    expect(task.completedAt).not.toBeNull()

    const external = await createTask(ctx, { project: 'abc', title: 'Ext', assignee: { kind: 'external', name: 'Bob' } })
    expect(external.assignee).toEqual({ kind: 'external', userId: null, name: 'Bob' })
  })

  it('rejects unknown assignees, invalid input and readers without write access', async () => {
    await expectServiceError(createTask(ctx, { project: 'abc', title: 'X', assignee: { kind: 'member', userId: crypto.randomUUID() } }), 'invalid')
    await expectServiceError(createTask(ctx, { project: 'abc', title: '' }), 'invalid')
    await expectServiceError(createTask(ctx, { project: 'nope', title: 'X' }), 'not_found')
    const memberId = await createMemberUser(t.db, 'bob', 3)
    const commenter = ctxFor(memberActor(memberId, { [abc.id]: 'commenter' }))
    await expectServiceError(createTask(commenter, { project: 'abc', title: 'X' }), 'forbidden')
    await expectServiceError(createTask(commenter, { title: 'X' }), 'not_found')
  })
})

describe('resolveTaskRef / getTask', () => {
  it('resolves keys case-insensitively and by id; hides deleted and invisible tasks', async () => {
    const created = await createTask(ctx, { project: 'abc', title: 'One' })
    expect((await resolveTaskRef(ctx, 'abc-1')).id).toBe(created.id)
    expect((await resolveTaskRef(ctx, ' ABC-1 ')).id).toBe(created.id)
    expect((await resolveTaskRef(ctx, created.id.toUpperCase())).id).toBe(created.id)
    await expectServiceError(resolveTaskRef(ctx, 'ABC-2'), 'not_found')
    await expectServiceError(resolveTaskRef(ctx, 'ZZZ-1'), 'not_found')
    await expectServiceError(resolveTaskRef(ctx, 'garbage'), 'not_found')

    const memberId = await createMemberUser(t.db, 'carol', 4)
    await expectServiceError(resolveTaskRef(ctxFor(memberActor(memberId, {})), 'ABC-1'), 'not_found')
    await expectServiceError(resolveTaskRef(ctxFor(publicActor(inbox.id)), 'ABC-1'), 'not_found')

    await deleteTask(ctx, 'ABC-1')
    await expectServiceError(resolveTaskRef(ctx, 'ABC-1'), 'not_found')
  })

  it('hides cross-project dependencies the member cannot see', async () => {
    await insertProject(t.db, 'secret', 'SEC')
    const hidden = await createTask(ctx, { project: 'secret', title: 'Hidden' })
    const visibleBlocker = await createTask(ctx, { project: 'abc', title: 'Visible blocker' })
    const task = await createTask(ctx, { project: 'abc', title: 'Main', blockedBy: [hidden.key, visibleBlocker.key] })
    await createTask(ctx, { project: 'secret', title: 'Blocked by main', blockedBy: [task.key] })

    const ownerView = await getTask(ctx, task.key)
    expect(ownerView.blockedBy).toHaveLength(2)
    expect(ownerView.blocking).toHaveLength(1)
    expect(ownerView.hiddenDependencies).toBe(0)

    const memberId = await createMemberUser(t.db, 'dave', 5)
    const member = ctxFor(memberActor(memberId, { [abc.id]: 'viewer' }))
    const memberView = await getTask(member, task.key)
    expect(memberView.blockedBy.map(b => b.key)).toEqual(['ABC-1'])
    expect(memberView.blocking).toEqual([])
    expect(memberView.hiddenDependencies).toBe(2)
    expect(memberView.blockedByKeys).toEqual(['ABC-1'])
    expect(memberView.capabilities).toEqual({ edit: false, comment: false, manage: false, vault: false })
    expect(ownerView.blockedBy[0]?.linkId).toBeTruthy()
  })

  it('public actors see tasks without comments, capabilities or hidden dependency counts', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'Public' })
    await addComment(ctx, task.key, 'internal note')
    const pub = ctxFor(publicActor(abc.id))
    const detail = await getTask(pub, task.key)
    expect(detail.title).toBe('Public')
    expect(detail.comments).toEqual([])
    expect(detail.capabilities).toBeUndefined()
    expect(detail.hiddenDependencies).toBe(0)
    expect(detail.commentCount).toBe(1)

    const memberId = await createMemberUser(t.db, 'erin', 6)
    const viewer = await getTask(ctxFor(memberActor(memberId, { [abc.id]: 'viewer' })), task.key)
    expect(viewer.comments.map(c => c.body)).toEqual(['internal note'])
  })
})

describe('listTasks', () => {
  async function seed() {
    const a = await createTask(ctx, { project: 'abc', title: 'Fix login bug', type: 'bug', priority: 'urgent', dueDate: '2026-03-01' })
    const b = await createTask(ctx, { project: 'abc', title: 'Write docs', type: 'docs', priority: 'low', executor: 'human', description: 'Has 100% coverage' })
    const c = await createTask(ctx, { project: 'abc', title: 'Ship feature', priority: 'high', dueDate: '2026-02-01', assignee: { kind: 'claude' } })
    const d = await createTask(ctx, { project: 'abc', title: 'Old thing', status: 'done' })
    const e = await createTask(ctx, { project: 'abc', title: 'Dropped', status: 'cancelled' })
    const f = await createTask(ctx, { title: 'Inbox idea', type: 'idea', priority: 'high' })
    return { a, b, c, d, e, f }
  }

  it('lists all visible projects and hides closed tasks by default', async () => {
    const { a, b, c, f } = await seed()
    const result = await listTasks(ctx, query())
    expect(result.total).toBe(4)
    expect(result.items.map(i => i.key)).toEqual([a.key, c.key, f.key, b.key])
    const withClosed = await listTasks(ctx, query({ includeClosed: true }))
    expect(withClosed.total).toBe(6)
    const done = await listTasks(ctx, query({ status: 'done' }))
    expect(done.items.map(i => i.title)).toEqual(['Old thing'])
  })

  it('filters by project and fields', async () => {
    await seed()
    expect((await listTasks(ctx, query({ project: 'abc' }))).total).toBe(3)
    expect((await listTasks(ctx, query({ project: 'all' }))).total).toBe(4)
    expect((await listTasks(ctx, query({ priority: 'high' }))).items.map(i => i.title).sort()).toEqual(['Inbox idea', 'Ship feature'])
    expect((await listTasks(ctx, query({ type: 'bug,docs' }))).total).toBe(2)
    expect((await listTasks(ctx, query({ executor: 'human' }))).items.map(i => i.title)).toEqual(['Write docs'])
    expect((await listTasks(ctx, query({ assignee: 'claude' }))).items.map(i => i.title)).toEqual(['Ship feature'])
    expect((await listTasks(ctx, query({ dueBefore: '2026-02-15' }))).items.map(i => i.title)).toEqual(['Ship feature'])
    await expectServiceError(listTasks(ctx, query({ project: 'missing' })), 'not_found')
  })

  it('searches title, description and keys with escaped LIKE', async () => {
    const { b, c } = await seed()
    expect((await listTasks(ctx, query({ q: 'LOGIN' }))).items.map(i => i.title)).toEqual(['Fix login bug'])
    expect((await listTasks(ctx, query({ q: '100%' }))).items.map(i => i.key)).toEqual([b.key])
    expect((await listTasks(ctx, query({ q: '%' }))).items.map(i => i.key)).toEqual([b.key])
    expect((await listTasks(ctx, query({ q: '_' }))).total).toBe(0)
    expect((await listTasks(ctx, query({ q: 'abc-3' }))).items.map(i => i.key)).toEqual([c.key])
    const search = await searchTasks(ctx, { query: 'inbox-1' })
    expect(search.map(i => i.title)).toEqual(['Inbox idea'])
  })

  it('sorts and paginates', async () => {
    const { a, b, c, f } = await seed()
    const keys = async (input: ListTasksQueryInput) => (await listTasks(ctx, query(input))).items.map(i => i.key)
    expect(await keys({ sort: 'due' })).toEqual([c.key, a.key, f.key, b.key])
    expect(await keys({ sort: 'key' })).toEqual([a.key, b.key, c.key, f.key])
    expect(await keys({ sort: 'created' })).toEqual([f.key, c.key, b.key, a.key])
    await updateTask(ctx, a.key, { expectedVersion: 1, patch: { title: 'Fix login bug!' } })
    expect((await keys({ sort: 'updated' }))[0]).toBe(a.key)
    await setTaskStatus(ctx, b.key, { status: 'in_progress' })
    expect(await keys({ sort: 'position', project: 'abc' })).toEqual([a.key, c.key, b.key])
    const page = await listTasks(ctx, query({ sort: 'key', limit: 2, offset: 1 }))
    expect(page.total).toBe(4)
    expect(page.items.map(i => i.key)).toEqual([b.key, c.key])
  })

  it('computes summary aggregates', async () => {
    const blocker = await createTask(ctx, { project: 'abc', title: 'Blocker' })
    const closedBlocker = await createTask(ctx, { project: 'abc', title: 'Closed blocker', status: 'done' })
    const task = await createTask(ctx, { project: 'abc', title: 'Main', checklist: ['x', 'y', 'z'], blockedBy: [blocker.key, closedBlocker.key] })
    await addComment(ctx, task.key, 'hello')
    await addComment(ctx, task.key, 'world')
    const [summary] = (await listTasks(ctx, query({ q: 'Main' }))).items
    expect(summary?.checklistTotal).toBe(3)
    expect(summary?.checklistDone).toBe(0)
    expect(summary?.blockedByKeys).toEqual([blocker.key])
    expect(summary?.commentCount).toBe(2)
    expect(summary?.assignee).toEqual({ kind: 'none', userId: null, name: null })
  })

  it('only shows invited projects to members and the shared project to public links', async () => {
    await seed()
    const memberId = await createMemberUser(t.db, 'frank', 7)
    const member = ctxFor(memberActor(memberId, { [inbox.id]: 'viewer' }))
    expect((await listTasks(member, query())).items.map(i => i.title)).toEqual(['Inbox idea'])
    await expectServiceError(listTasks(member, query({ project: 'abc' })), 'not_found')
    const pub = ctxFor(publicActor(abc.id))
    expect((await listTasks(pub, query())).total).toBe(3)
  })
})

describe('updateTask', () => {
  it('applies a patch and bumps the version', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'One' })
    const updated = await updateTask(ctx, task.key, {
      expectedVersion: 1,
      patch: { title: 'Uno', priority: 'urgent', size: 'M', dueDate: '2026-05-01', assignee: { kind: 'owner' } },
    })
    expect(updated.version).toBe(2)
    expect(updated.title).toBe('Uno')
    expect(updated.size).toBe('M')
    expect(updated.assignee.kind).toBe('owner')
    const cleared = await updateTask(ctx, task.key, { expectedVersion: 2, patch: { size: null, dueDate: null } })
    expect(cleared.size).toBeNull()
    expect(cleared.dueDate).toBeNull()
  })

  it('throws a conflict carrying the current detail on version mismatch', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'One' })
    const mcp = ctxFor(mcpActor(t.ownerId, { tokenName: 'cc' }))
    await updateTask(mcp, task.key, { expectedVersion: 1, patch: { title: 'By Claude' } })
    const error = await expectServiceError(updateTask(ctx, task.key, { expectedVersion: 1, patch: { title: 'By me' } }), 'conflict')
    expect(error.status).toBe(409)
    expect(error.message).toContain('ABC-1')
    expect(error.message).toContain('mcp:cc')
    const current = error.details as TaskDetailDto
    expect(current.title).toBe('By Claude')
    expect(current.version).toBe(2)
  })

  it('maintains completed_at and moves to the bottom of the new column', async () => {
    const done1 = await createTask(ctx, { project: 'abc', title: 'Done already', status: 'done' })
    const task = await createTask(ctx, { project: 'abc', title: 'One' })
    const finished = await updateTask(ctx, task.key, { expectedVersion: 1, patch: { status: 'done' } })
    expect(finished.completedAt).not.toBeNull()
    expect(finished.position).toBeGreaterThan(done1.position)
    const reopened = await updateTask(ctx, task.key, { expectedVersion: 2, patch: { status: 'todo' } })
    expect(reopened.completedAt).toBeNull()
  })

  it('requires task.write', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'One' })
    const memberId = await createMemberUser(t.db, 'gina', 8)
    const commenter = ctxFor(memberActor(memberId, { [abc.id]: 'commenter' }))
    await expectServiceError(updateTask(commenter, task.key, { expectedVersion: 1, patch: { title: 'x' } }), 'forbidden')
  })
})

describe('setTaskStatus', () => {
  it('handles blocker, notes and optional version checks', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'One' })
    const blocked = await setTaskStatus(ctx, task.key, { status: 'blocked', blocker: { who: 'Client', what: 'Content', since: '2026-01-10' }, note: 'waiting' })
    expect(blocked.status).toBe('blocked')
    expect(blocked.blocker).toEqual({ who: 'Client', what: 'Content', since: '2026-01-10' })
    expect(blocked.comments.map(c => c.body)).toEqual(['waiting'])
    expect(blocked.version).toBe(2)

    const resumed = await setTaskStatus(ctx, task.key, { status: 'in_progress' })
    expect(resumed.blocker).not.toBeNull()
    const cleared = await setTaskStatus(ctx, task.key, { status: 'in_progress', blocker: null })
    expect(cleared.blocker).toBeNull()

    await expectServiceError(setTaskStatus(ctx, task.key, { status: 'done', expectedVersion: 1 }), 'conflict')
    const done = await setTaskStatus(ctx, task.key, { status: 'done', expectedVersion: cleared.version })
    expect(done.completedAt).not.toBeNull()

    const same = await setTaskStatus(ctx, task.key, { status: 'done' })
    expect(same.version).toBe(done.version)
  })
})

describe('moveTask', () => {
  it('positions between neighbours and changes status', async () => {
    const a = await createTask(ctx, { project: 'abc', title: 'A', status: 'todo' })
    const b = await createTask(ctx, { project: 'abc', title: 'B', status: 'todo' })
    const c = await createTask(ctx, { project: 'abc', title: 'C', status: 'in_progress' })
    const moved = await moveTask(ctx, c.key, { status: 'todo', beforeId: a.id, afterId: b.id, expectedVersion: 1 })
    expect(moved.status).toBe('todo')
    expect(moved.position).toBe((a.position + b.position) / 2)
    expect(moved.version).toBe(2)
    const top = await moveTask(ctx, b.key, { status: 'todo', afterId: a.id, expectedVersion: 1 })
    expect(top.position).toBeLessThan(a.position)
    const order = (await listTasks(ctx, query({ project: 'abc', sort: 'position' }))).items.map(i => i.title)
    expect(order).toEqual(['B', 'A', 'C'])
    await expectServiceError(moveTask(ctx, c.key, { status: 'done', expectedVersion: 1 }), 'conflict')
    const done = await moveTask(ctx, c.key, { status: 'done', expectedVersion: 2 })
    expect(done.completedAt).not.toBeNull()
  })

  it('rebalances the column when the gap is exhausted', async () => {
    const a = await createTask(ctx, { project: 'abc', title: 'A' })
    const b = await createTask(ctx, { project: 'abc', title: 'B' })
    const c = await createTask(ctx, { project: 'abc', title: 'C' })
    await t.db.update(tasks).set({ position: 1000 }).where(eq(tasks.id, a.id))
    await t.db.update(tasks).set({ position: 1000 + 1e-7 }).where(eq(tasks.id, b.id))
    const moved = await moveTask(ctx, c.key, { status: 'todo', beforeId: a.id, afterId: b.id, expectedVersion: 1 })
    expect(moved.position).toBe(2048)
    const items = (await listTasks(ctx, query({ project: 'abc', sort: 'position' }))).items
    expect(items.map(i => [i.title, i.position])).toEqual([['A', 1024], ['C', 2048], ['B', 3072]])
    expect(items.find(i => i.title === 'A')?.version).toBe(1)
  })
})

describe('deleteTask', () => {
  it('soft deletes and requires task.delete', async () => {
    const task = await createTask(ctx, { project: 'abc', title: 'One' })
    const mcp = ctxFor(mcpActor(t.ownerId))
    await expectServiceError(deleteTask(mcp, task.key), 'forbidden')
    await deleteTask(ctx, task.key)
    expect((await listTasks(ctx, query({ includeClosed: true }))).total).toBe(0)
    const [row] = await t.db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row?.deletedAt).toBeInstanceOf(Date)
  })
})

describe('getProjectContext', () => {
  it('summarises the default project for MCP sessions', async () => {
    await createTask(ctx, { project: 'abc', title: 'Doing', status: 'in_progress' })
    await createTask(ctx, { project: 'abc', title: 'Review me', status: 'in_review' })
    await createTask(ctx, { project: 'abc', title: 'Waiting', status: 'blocked' })
    for (const [i, priority] of (['low', 'urgent', 'medium', 'high', 'low', 'medium'] as const).entries()) {
      await createTask(ctx, { project: 'abc', title: `Todo ${i}`, priority })
    }
    await createTask(ctx, { project: 'abc', title: 'Finished', status: 'done' })
    const mcp = ctxFor(mcpActor(t.ownerId, { defaultProject: 'abc' }))
    const context = await getProjectContext(mcp)
    expect(context.project.key).toBe('ABC')
    expect(context.project.counts.todo).toBe(6)
    expect(context.project.openCount).toBe(9)
    expect(context.inProgress.map(i => i.title)).toEqual(['Doing'])
    expect(context.inReview.map(i => i.title)).toEqual(['Review me'])
    expect(context.blocked.map(i => i.title)).toEqual(['Waiting'])
    expect(context.nextUp.map(i => i.title)).toEqual(['Todo 1', 'Todo 3', 'Todo 2', 'Todo 5', 'Todo 0'])
    expect((await getProjectContext(ctx)).project.slug).toBe('inbox')
  })
})

describe('integration with links', () => {
  it('shows open blockers in summaries after addBlockedBy', async () => {
    const a = await createTask(ctx, { project: 'abc', title: 'A' })
    const b = await createTask(ctx, { project: 'abc', title: 'B' })
    await addBlockedBy(ctx, b.key, a.key)
    await addChecklistItems(ctx, b.key, ['one'])
    const detail = await getTask(ctx, b.key)
    expect(detail.blockedByKeys).toEqual([a.key])
    expect(detail.version).toBe(1)
  })
})
