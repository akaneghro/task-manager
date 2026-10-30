import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db'
import { comments, projects } from '../../db/schema'
import type { ProjectRow } from '../../db/schema'
import type { Actor } from '../../../shared/utils/permissions'
import { ServiceError } from '../context'
import type { ServiceContext } from '../context'
import { createTask, getTask, setTaskStatus } from '../tasks'
import type { TaskDetailDto } from '../../../shared/types/dto'
import { addComment, deleteComment, listComments, updateComment } from '../comments'
import { createMemberUser, createTestDb, makeCtx, mcpActor, memberActor, ownerActor, publicActor } from './helpers'
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
let task: TaskDetailDto
let commenterId: string
let viewerId: string
const ctxFor = (actor: Actor) => makeCtx(t.db, actor, { now: () => new Date((tick += 1000)) })

beforeEach(async () => {
  t = await createTestDb()
  tick = Date.parse('2026-01-01T00:00:00Z')
  abc = await insertProject(t.db, 'abc', 'ABC')
  ctx = ctxFor(ownerActor(t.ownerId))
  task = await createTask(ctx, { project: 'abc', title: 'T' })
  commenterId = await createMemberUser(t.db, 'carol', 2)
  viewerId = await createMemberUser(t.db, 'victor', 3)
})

afterEach(() => {
  t.cleanup()
})

describe('comments', () => {
  it('owner adds comments; task updated_at moves, version does not', async () => {
    const comment = await addComment(ctx, task.key, '  Hello **world**  ')
    expect(comment.body).toBe('Hello **world**')
    expect(comment.author).toEqual({ login: 'owner', avatarUrl: null, isClaude: false })
    expect(comment.authorSource).toBe(`user:${t.ownerId}`)
    expect(comment.canEdit).toBe(true)
    const detail = await getTask(ctx, task.key)
    expect(detail.version).toBe(1)
    expect(Date.parse(detail.updatedAt)).toBeGreaterThan(Date.parse(task.updatedAt))
    expect(detail.commentCount).toBe(1)
    await expectCode(addComment(ctx, task.key, '   '), 'invalid')
  })

  it('viewer reads but cannot write; commenter writes and edits own', async () => {
    const viewer = ctxFor(memberActor(viewerId, { [abc.id]: 'viewer' }))
    const commenter = ctxFor(memberActor(commenterId, { [abc.id]: 'commenter' }))
    const ownerComment = await addComment(ctx, task.key, 'from owner')
    await expectCode(addComment(viewer, task.key, 'nope'), 'forbidden')

    const mine = await addComment(commenter, task.key, 'from carol')
    expect(mine.canEdit).toBe(true)
    expect(mine.author.login).toBe('carol')

    const viewerList = await listComments(viewer, task.key)
    expect(viewerList.map(c => c.body)).toEqual(['from owner', 'from carol'])
    expect(viewerList.every(c => !c.canEdit)).toBe(true)

    const commenterList = await listComments(commenter, task.key)
    expect(commenterList.map(c => c.canEdit)).toEqual([false, true])

    const edited = await updateComment(commenter, mine.id, 'edited')
    expect(edited.body).toBe('edited')
    await expectCode(updateComment(commenter, ownerComment.id, 'hijack'), 'forbidden')
    await expectCode(deleteComment(commenter, ownerComment.id), 'forbidden')
    await deleteComment(commenter, mine.id)
    expect((await listComments(ctx, task.key)).map(c => c.body)).toEqual(['from owner'])

    // Downgraded to viewer: can no longer edit their own comments.
    const again = await addComment(commenter, task.key, 'second')
    const downgraded = ctxFor(memberActor(commenterId, { [abc.id]: 'viewer' }))
    await expectCode(updateComment(downgraded, again.id, 'x'), 'forbidden')
  })

  it('MCP can write but not edit or delete; owner moderates everything', async () => {
    const mcp = ctxFor(mcpActor(t.ownerId, { tokenName: 'cc' }))
    const fromClaude = await addComment(mcp, task.key, 'done: files changed')
    expect(fromClaude.authorSource).toBe('mcp:cc')
    expect(fromClaude.author.isClaude).toBe(true)
    expect(fromClaude.author.login).toBe('owner')
    expect(fromClaude.canEdit).toBe(false)
    const [row] = await t.db.select().from(comments).where(eq(comments.id, fromClaude.id))
    expect(row?.authorUserId).toBe(t.ownerId)

    await expectCode(updateComment(mcp, fromClaude.id, 'x'), 'forbidden')
    await expectCode(deleteComment(mcp, fromClaude.id), 'forbidden')

    const commenter = ctxFor(memberActor(commenterId, { [abc.id]: 'commenter' }))
    const memberComment = await addComment(commenter, task.key, 'member says')
    const moderated = await updateComment(ctx, memberComment.id, 'moderated')
    expect(moderated.body).toBe('moderated')
    expect(moderated.canEdit).toBe(true)
    await deleteComment(ctx, fromClaude.id)
    await deleteComment(ctx, memberComment.id)
    expect(await listComments(ctx, task.key)).toEqual([])
    await expectCode(deleteComment(ctx, memberComment.id), 'not_found')
  })

  it('public links and outsiders cannot read comments', async () => {
    await addComment(ctx, task.key, 'secret talk')
    await expectCode(listComments(ctxFor(publicActor(abc.id)), task.key), 'forbidden')
    await expectCode(addComment(ctxFor(publicActor(abc.id)), task.key, 'spam'), 'forbidden')
    await expectCode(listComments(ctxFor(memberActor(viewerId, {})), task.key), 'not_found')
    const [comment] = await listComments(ctx, task.key)
    await expectCode(updateComment(ctxFor(memberActor(viewerId, {})), comment!.id, 'x'), 'not_found')
  })

  it('setStatus notes become comments', async () => {
    const mcp = ctxFor(mcpActor(t.ownerId, { tokenName: 'cc' }))
    const detail = await setTaskStatus(mcp, task.key, { status: 'in_review', note: 'Ready for review' })
    expect(detail.comments).toHaveLength(1)
    expect(detail.comments[0]?.author.isClaude).toBe(true)
  })
})
