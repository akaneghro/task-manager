import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { TaskDetailDto } from '#shared/types/dto'
import type { TaskPatch } from '#shared/schemas/task'
import { useTaskMutations } from '../useTaskMutations'

function detail(overrides: Partial<TaskDetailDto> = {}): TaskDetailDto {
  return {
    id: 't1',
    key: 'ABC-1',
    number: 1,
    projectId: 'p1',
    projectSlug: 'abc',
    projectKey: 'ABC',
    projectName: 'ABC',
    title: 'Task',
    status: 'todo',
    priority: 'medium',
    type: 'feature',
    size: null,
    executor: 'ai',
    assignee: { kind: 'none', userId: null, name: null },
    dueDate: null,
    blocker: null,
    position: 1024,
    version: 3,
    checklistDone: 0,
    checklistTotal: 0,
    blockedByKeys: [],
    commentCount: 0,
    completedAt: null,
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
    createdBy: 'user:u1',
    updatedBy: 'user:u1',
    description: '',
    checklist: [],
    blockedBy: [],
    blocking: [],
    hiddenDependencies: 0,
    comments: [],
    ...overrides,
  }
}

interface PatchBody {
  expectedVersion: number
  patch: TaskPatch
}

/**
 * Fake PATCH /api/tasks/:ref with the server's strict version check. Requests stay pending until `flush()`, so
 * tests can start several edits while the first one is in flight.
 */
function fakeServer(initial: TaskDetailDto) {
  let server = initial
  const sent: PatchBody[] = []
  const pending: Array<() => void> = []
  const fetchMock = vi.fn((_url: string, options: { body: PatchBody }) => new Promise((resolve, reject) => {
    sent.push(options.body)
    pending.push(() => {
      const { expectedVersion, patch } = options.body
      if (expectedVersion !== server.version) {
        reject(Object.assign(new Error('conflict'), { statusCode: 409, data: { code: 'conflict', message: 'conflict', details: server } }))
        return
      }
      server = { ...server, ...(patch as Partial<TaskDetailDto>), version: server.version + 1 }
      resolve(server)
    })
  }))
  return {
    fetchMock,
    sent,
    get state() {
      return server
    },
    resolveNext() {
      pending.shift()?.()
    },
    /** Someone else (Claude, another tab) edits the task. */
    externalEdit(changes: Partial<TaskDetailDto>) {
      server = { ...server, ...changes, version: server.version + 1 }
    },
    async flush() {
      // Answer requests one by one, letting each settle before the queue sends the next.
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 0))
        const next = pending.shift()
        if (!next) {
          if (i > 2) return
          continue
        }
        next()
      }
    },
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => key, te: () => false }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTaskMutations.patchTask', () => {
  it('serializes quick successive edits so they never conflict with each other', async () => {
    const server = fakeServer(detail())
    vi.stubGlobal('$fetch', server.fetchMock)
    const mutations = useTaskMutations()
    const target = ref<TaskDetailDto | null>(detail())

    const first = mutations.patchTask(target, { priority: 'high' })
    const second = mutations.patchTask(target, { status: 'in_progress' })
    // Both edits show up right away (optimistic).
    expect(target.value).toMatchObject({ priority: 'high', status: 'in_progress', version: 3 })
    expect(mutations.isPatching('t1')).toBe(true)

    await server.flush()
    const [saved1, saved2] = await Promise.all([first, second])

    // The second PATCH waited for the first one and used the version it returned.
    expect(server.sent.map(b => b.expectedVersion)).toEqual([3, 4])
    expect(saved1?.version).toBe(4)
    expect(saved2?.version).toBe(5)
    expect(mutations.conflict.value).toBeNull()
    expect(target.value).toMatchObject({ priority: 'high', status: 'in_progress', version: 5 })
    expect(server.state).toMatchObject({ priority: 'high', status: 'in_progress', version: 5 })
    expect(mutations.isPatching('t1')).toBe(false)
  })

  it('keeps the queued optimistic edit visible when the earlier save lands', async () => {
    const server = fakeServer(detail())
    vi.stubGlobal('$fetch', server.fetchMock)
    const mutations = useTaskMutations()
    const target = ref<TaskDetailDto | null>(detail())
    const first = mutations.patchTask(target, { priority: 'high' })
    const second = mutations.patchTask(target, { title: 'Renamed' })
    await new Promise(resolve => setTimeout(resolve, 0))
    server.resolveNext() // only the first request
    await first
    // Server state of the first save + the edit still queued on top of it.
    expect(target.value).toMatchObject({ title: 'Renamed', priority: 'high', version: 4 })
    await server.flush()
    expect((await second)?.version).toBe(5)
    expect(target.value).toMatchObject({ title: 'Renamed', priority: 'high', version: 5 })
  })

  it('on a real conflict restores the server state (not a stale snapshot) and folds queued edits into it', async () => {
    const server = fakeServer(detail())
    vi.stubGlobal('$fetch', server.fetchMock)
    const mutations = useTaskMutations()
    const target = ref<TaskDetailDto | null>(detail())

    server.externalEdit({ title: 'Changed by Claude' }) // server now at v4
    const first = mutations.patchTask(target, { priority: 'high' })
    const second = mutations.patchTask(target, { status: 'done' })
    await server.flush()
    expect(await first).toBeNull()
    expect(await second).toBeNull()

    // Only the first request was sent; the queued edit became part of the conflict instead.
    expect(server.sent).toHaveLength(1)
    expect(mutations.conflict.value?.patch).toEqual({ priority: 'high', status: 'done' })
    expect(mutations.conflict.value?.current.version).toBe(4)
    // The drawer shows the latest server state (v4), so the next edit is not rejected again.
    expect(target.value).toMatchObject({ title: 'Changed by Claude', version: 4, priority: 'medium' })

    const saved = mutations.overwriteMine(target)
    await server.flush()
    expect((await saved)?.version).toBe(5)
    expect(server.state).toMatchObject({ title: 'Changed by Claude', priority: 'high', status: 'done' })
  })

  it('after a failed save the next edit uses the latest confirmed version', async () => {
    const server = fakeServer(detail())
    const mutations = useTaskMutations()
    const target = ref<TaskDetailDto | null>(detail())
    let calls = 0
    vi.stubGlobal('$fetch', vi.fn((url: string, options: { body: PatchBody }) => {
      calls++
      if (calls === 2) return Promise.reject(Object.assign(new Error('boom'), { statusCode: 500 }))
      return server.fetchMock(url, options)
    }))

    const ok = mutations.patchTask(target, { priority: 'high' })
    const failed = mutations.patchTask(target, { title: 'Will fail' })
    await server.flush()
    expect(await ok).not.toBeNull()
    expect(await failed).toBeNull()
    expect(target.value).toMatchObject({ priority: 'high', title: 'Task', version: 4 })

    const next = mutations.patchTask(target, { status: 'in_review' })
    await server.flush()
    expect((await next)?.version).toBe(5)
    expect(server.sent.map(b => b.expectedVersion)).toEqual([3, 4])
  })
})
