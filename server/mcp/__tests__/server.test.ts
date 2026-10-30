import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createTestDb, makeCtx, mcpActor, ownerActor } from '../../services/__tests__/helpers'
import type { TestDb } from '../../services/__tests__/helpers'
import { ensureInbox, createProject } from '../../services/projects'
import { createAccount, listAccounts } from '../../services/accounts'
import { getTask } from '../../services/tasks'
import type { ServiceContext } from '../../services/context'
import { MCP_PROMPT_NAMES, MCP_TOOL_NAMES, buildMcpServer, createTaskManagerMcpHandler } from '../server'
import { mcpActorFromAuthInfo, mcpActorFromToken, mcpAuthInfo, parseDefaultProject } from '../actor'
import { compactJson } from '../result'

interface ToolOutcome {
  isError: boolean
  text: string
  structured: unknown
}

let t: TestDb
let ownerCtx: ServiceContext
const clients: Client[] = []

async function connect(ctx: ServiceContext): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await buildMcpServer(ctx).connect(serverTransport)
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientTransport)
  clients.push(client)
  return client
}

function mcpCtx(opts: { allowSecrets?: boolean, defaultProject?: string | null } = {}): ServiceContext {
  return makeCtx(t.db, mcpActor(t.ownerId, { defaultProject: 'demo', ...opts }))
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> {
  const result: unknown = await client.callTool({ name, arguments: args })
  const r = result as { isError?: boolean, content?: Array<{ type: string, text?: string }>, structuredContent?: unknown }
  const text = (r.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n')
  return { isError: r.isError === true, text, structured: r.structuredContent }
}

/** Parses the JSON payload of a successful tool result (last line; a note may precede it). */
function json<T = Record<string, unknown>>(outcome: ToolOutcome): T {
  expect(outcome.isError, outcome.text).toBe(false)
  const lines = outcome.text.split('\n')
  return JSON.parse(lines[lines.length - 1] ?? 'null') as T
}

interface CreatedTask { key: string, version: number, url: string, project: string, status: string }
interface TaskView {
  key: string
  version: number
  status: string
  title: string
  priority: string
  assignee?: unknown
  checklist?: Array<{ index: number, id: string, text: string, done: boolean }>
  blockedBy?: Array<{ key: string }>
  comments?: Array<{ by: string, body: string }>
}

beforeEach(async () => {
  t = await createTestDb()
  await ensureInbox(t.db)
  ownerCtx = makeCtx(t.db, ownerActor(t.ownerId))
  await createProject(ownerCtx, { name: 'Demo', key: 'DEM', slug: 'demo', status: 'development' })
  await createProject(ownerCtx, { name: 'Other', key: 'OTH', slug: 'other' })
})

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close()
  t.cleanup()
})

describe('mcp server: discovery', () => {
  it('lists the 17 tools with object input schemas and annotations', async () => {
    const client = await connect(mcpCtx())
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort())
    expect(tools).toHaveLength(17)
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.description?.length ?? 0).toBeGreaterThan(40)
      expect(tool.annotations?.destructiveHint).toBe(false)
      expect(tool.annotations?.openWorldHint).toBe(false)
    }
    const byName = new Map(tools.map(tool => [tool.name, tool]))
    for (const name of ['get_context', 'list_projects', 'get_project', 'list_tasks', 'get_task', 'search_tasks', 'list_shared_secrets']) {
      expect(byName.get(name)?.annotations?.readOnlyHint, name).toBe(true)
    }
    expect(byName.get('create_task')?.annotations?.readOnlyHint).toBe(false)
    expect(byName.get('toggle_checklist_item')?.annotations?.idempotentHint).toBe(true)
    expect(byName.get('set_status')?.annotations?.idempotentHint).toBe(true)
    expect(Object.keys(byName.get('create_task')?.inputSchema.properties ?? {})).toEqual(expect.arrayContaining([
      'project', 'title', 'description', 'status', 'priority', 'type', 'size', 'executor', 'assignee', 'dueDate', 'checklist', 'blockedBy',
    ]))
    expect(byName.get('update_task')?.inputSchema.required).toEqual(expect.arrayContaining(['ref', 'expectedVersion', 'patch']))
    expect(client.getInstructions()).toContain('get_context')
  })

  it('lists and renders the prompts', async () => {
    const client = await connect(mcpCtx())
    const { prompts } = await client.listPrompts()
    expect(prompts.map(p => p.name).sort()).toEqual([...MCP_PROMPT_NAMES].sort())

    const next = await client.getPrompt({ name: 'next-task', arguments: { project: 'other' } })
    const nextText = next.messages.map(m => (m.content.type === 'text' ? m.content.text : '')).join('\n')
    expect(nextText).toContain('get_context')
    expect(nextText).toContain('"other"')
    expect(nextText).toContain('in_progress')

    const wrap = await client.getPrompt({ name: 'wrap-up', arguments: { ref: 'DEM-3' } })
    const wrapText = wrap.messages.map(m => (m.content.type === 'text' ? m.content.text : '')).join('\n')
    expect(wrapText).toContain('DEM-3')
    expect(wrapText).toContain('add_comment')

    const defaults = await client.getPrompt({ name: 'next-task', arguments: {} })
    expect(defaults.messages[0]?.content.type).toBe('text')
  })
})

describe('mcp server: tasks', () => {
  it('create_task -> get_task -> update_task with a stale version returns a conflict with the current state', async () => {
    const client = await connect(mcpCtx())
    const created = json<CreatedTask>(await call(client, 'create_task', {
      title: 'Write docs',
      type: 'docs',
      size: 'S',
      checklist: ['outline', 'draft'],
      assignee: { external: 'Ana' },
    }))
    expect(created).toMatchObject({ key: 'DEM-1', version: 1, project: 'demo', status: 'todo', url: 'http://localhost:3000/tasks/DEM-1' })

    const task = json<TaskView>(await call(client, 'get_task', { ref: 'dem-1' }))
    expect(task).toMatchObject({ key: 'DEM-1', version: 1, title: 'Write docs', assignee: { external: 'Ana' } })
    expect(task.checklist?.map(i => i.text)).toEqual(['outline', 'draft'])

    const updated = json<TaskView>(await call(client, 'update_task', { ref: 'DEM-1', expectedVersion: 1, patch: { title: 'Write the docs' } }))
    expect(updated).toMatchObject({ key: 'DEM-1', version: 2, title: 'Write the docs' })

    // The user edits it meanwhile in the UI...
    const stale = await call(client, 'update_task', { ref: 'DEM-1', expectedVersion: 1, patch: { title: 'Mine' } })
    expect(stale.isError).toBe(true)
    expect(stale.text).toContain('Conflict')
    expect(stale.text).toContain('expectedVersion=2')
    expect(stale.text).toContain('"title":"Write the docs"')
    expect(stale.structured).toMatchObject({ error: 'version_conflict', current: { key: 'DEM-1', version: 2 } })
    expect((await getTask(ownerCtx, 'DEM-1')).title).toBe('Write the docs')
  })

  it('validates input and reports service errors as isError results', async () => {
    const client = await connect(mcpCtx())
    const invalid = await call(client, 'create_task', { title: 'x', dueDate: '2026-13-45' })
    expect(invalid.isError).toBe(true)
    const missing = await call(client, 'get_task', { ref: 'DEM-99' })
    expect(missing).toMatchObject({ isError: true })
    expect(missing.text).toContain('Not found')
    const badProject = await call(client, 'create_task', { project: 'nope', title: 'x' })
    expect(badProject.isError).toBe(true)
  })

  it('set_status stores the note as a comment and the blocker', async () => {
    const client = await connect(mcpCtx())
    json(await call(client, 'create_task', { title: 'Deploy' }))
    const started = json<TaskView>(await call(client, 'set_status', { ref: 'DEM-1', status: 'in_progress', expectedVersion: 1 }))
    expect(started).toMatchObject({ status: 'in_progress', version: 2 })
    const again = json<TaskView>(await call(client, 'set_status', { ref: 'DEM-1', status: 'in_progress' }))
    expect(again.version).toBe(2)
    const blocked = json<TaskView & { blocker?: { who: string } }>(await call(client, 'set_status', {
      ref: 'DEM-1',
      status: 'blocked',
      note: 'Waiting for DNS',
      blocker: { who: 'Client', what: 'DNS access' },
    }))
    expect(blocked).toMatchObject({ status: 'blocked', blocker: { who: 'Client' } })
    const detail = json<TaskView>(await call(client, 'get_task', { ref: 'DEM-1' }))
    expect(detail.comments?.[0]).toMatchObject({ by: 'mcp:test-token', body: 'Waiting for DNS' })
    expect(json<{ commentId: string }>(await call(client, 'add_comment', { ref: 'DEM-1', body: 'Summary' })).commentId).toBeTruthy()
  })

  it('toggle_checklist_item is idempotent and does not bump the task version', async () => {
    const client = await connect(mcpCtx())
    json(await call(client, 'create_task', { title: 'Steps', checklist: ['one'] }))
    const added = json<{ checklist: Array<{ index: number, id: string, text: string }> }>(
      await call(client, 'add_checklist_items', { ref: 'DEM-1', items: ['two', 'three'] }),
    )
    expect(added.checklist.map(i => [i.index, i.text])).toEqual([[1, 'one'], [2, 'two'], [3, 'three']])

    const first = json<{ item: { done: boolean } }>(await call(client, 'toggle_checklist_item', { ref: 'DEM-1', index: 2, done: true }))
    const second = json<{ item: { done: boolean } }>(await call(client, 'toggle_checklist_item', { ref: 'DEM-1', index: 2, done: true }))
    expect(first.item.done).toBe(true)
    expect(second.item.done).toBe(true)
    const byId = json<{ item: { done: boolean, text: string } }>(
      await call(client, 'toggle_checklist_item', { ref: 'DEM-1', itemId: added.checklist[0]?.id, done: true }),
    )
    expect(byId.item).toMatchObject({ text: 'one', done: true })

    const task = json<TaskView>(await call(client, 'get_task', { ref: 'DEM-1' }))
    expect(task.version).toBe(1)
    expect(task.checklist?.map(i => i.done)).toEqual([true, true, false])
    const rows = json<{ tasks: Array<{ key: string, checklist?: string }> }>(await call(client, 'list_tasks', {}))
    expect(rows.tasks[0]).toMatchObject({ key: 'DEM-1', checklist: '2/3' })

    expect((await call(client, 'toggle_checklist_item', { ref: 'DEM-1', done: true })).isError).toBe(true)
    expect((await call(client, 'toggle_checklist_item', { ref: 'DEM-1', index: 9, done: true })).isError).toBe(true)
  })

  it('link_tasks adds and removes dependencies and rejects cycles', async () => {
    const client = await connect(mcpCtx())
    json(await call(client, 'create_task', { title: 'A' }))
    json(await call(client, 'create_task', { title: 'B' }))
    json(await call(client, 'create_task', { project: 'other', title: 'C' }))

    const linked = json<{ key: string, blockedBy: Array<{ key: string }> }>(
      await call(client, 'link_tasks', { ref: 'DEM-1', blockedBy: ['DEM-2', 'OTH-1'] }),
    )
    expect(linked.blockedBy.map(l => l.key).sort()).toEqual(['DEM-2', 'OTH-1'])

    const cycle = await call(client, 'link_tasks', { ref: 'DEM-2', blockedBy: 'DEM-1' })
    expect(cycle.isError).toBe(true)
    expect(cycle.text).toContain('cycle')

    const removed = json<{ blockedBy: Array<{ key: string }> }>(await call(client, 'link_tasks', { ref: 'DEM-1', blockedBy: 'OTH-1', remove: true }))
    expect(removed.blockedBy.map(l => l.key)).toEqual(['DEM-2'])

    const created = json<CreatedTask>(await call(client, 'create_task', { title: 'D', blockedBy: ['DEM-1'] }))
    const d = json<TaskView>(await call(client, 'get_task', { ref: created.key }))
    expect(d.blockedBy?.map(l => l.key)).toEqual(['DEM-1'])
  })

  it('list_tasks and search_tasks default to the session project and accept "all"', async () => {
    const client = await connect(mcpCtx())
    json(await call(client, 'create_task', { title: 'Fix login bug', type: 'bug', priority: 'high' }))
    json(await call(client, 'create_task', { title: 'Polish', priority: 'low' }))
    json(await call(client, 'create_task', { project: 'other', title: 'Other login thing' }))

    const own = json<{ project: string, total: number, tasks: Array<{ key: string }> }>(await call(client, 'list_tasks', {}))
    expect(own.project).toBe('demo')
    expect(own.tasks.map(r => r.key)).toEqual(['DEM-1', 'DEM-2'])

    const all = json<{ total: number, more?: boolean, tasks: unknown[] }>(await call(client, 'list_tasks', { project: 'all', limit: 2 }))
    expect(all).toMatchObject({ total: 3, more: true })
    expect(all.tasks).toHaveLength(2)

    const bugs = json<{ tasks: Array<{ key: string }> }>(await call(client, 'list_tasks', { type: ['bug'] }))
    expect(bugs.tasks.map(r => r.key)).toEqual(['DEM-1'])

    const found = json<{ tasks: Array<{ key: string }> }>(await call(client, 'search_tasks', { query: 'login' }))
    expect(found.tasks.map(r => r.key)).toEqual(['DEM-1'])
    const everywhere = json<{ tasks: Array<{ key: string }> }>(await call(client, 'search_tasks', { query: 'login', project: 'all' }))
    expect(everywhere.tasks.map(r => r.key).sort()).toEqual(['DEM-1', 'OTH-1'])

    expect((await call(client, 'list_tasks', { limit: 500 })).isError).toBe(true)
  })
})

describe('mcp server: projects and context', () => {
  it('get_context uses the session default project', async () => {
    const client = await connect(mcpCtx())
    json(await call(client, 'create_task', { title: 'Next one', priority: 'urgent' }))
    json(await call(client, 'create_task', { title: 'Working', status: 'in_progress' }))
    const context = json<{
      session: { defaultProject: string, secretsAllowed: boolean }
      project: { slug: string, openTasks: number }
      nextUp: Array<{ key: string }>
      inProgress: Array<{ key: string }>
    }>(await call(client, 'get_context'))
    expect(context.session).toMatchObject({ defaultProject: 'demo', secretsAllowed: false })
    expect(context.project).toMatchObject({ slug: 'demo', openTasks: 2 })
    expect(context.nextUp.map(r => r.key)).toEqual(['DEM-1'])
    expect(context.inProgress.map(r => r.key)).toEqual(['DEM-2'])

    const other = json<{ project: { slug: string } }>(await call(client, 'get_context', { project: 'other' }))
    expect(other.project.slug).toBe('other')
  })

  it('get_context without a default project returns the project list and a hint', async () => {
    const client = await connect(mcpCtx({ defaultProject: null }))
    const result = json<{ hint: string, projects: Array<{ slug: string }> }>(await call(client, 'get_context'))
    expect(result.hint).toContain('X-TM-Project')
    // Inbox first, then by status order (idea < development).
    expect(result.projects.map(p => p.slug)).toEqual(['inbox', 'other', 'demo'])
    expect((await call(client, 'get_project')).isError).toBe(true)
  })

  it('get_context reports an unknown default project clearly', async () => {
    const client = await connect(mcpCtx({ defaultProject: 'ghost' }))
    const result = await call(client, 'get_context')
    expect(result.isError).toBe(true)
    expect(result.text).toContain('ghost')
    expect(result.text).toContain('list_projects')
  })

  it('creates projects, reads them and edits notes with append/replace', async () => {
    const client = await connect(mcpCtx())
    const created = json<{ slug: string, key: string, version: number, url: string }>(
      await call(client, 'create_project', { name: 'Renkia Web', key: 'rnk', client: 'Renkia' }),
    )
    expect(created).toMatchObject({ slug: 'renkia-web', key: 'RNK', url: 'http://localhost:3000/projects/renkia-web' })
    expect((await call(client, 'create_project', { name: 'Dup', key: 'RNK' })).isError).toBe(true)

    const listed = json<{ projects: Array<{ slug: string }> }>(await call(client, 'list_projects', { status: ['idea'] }))
    expect(listed.projects.map(p => p.slug)).toEqual(['other', 'renkia-web'])

    const appended = json<{ version: number }>(await call(client, 'update_project_notes', { mode: 'append', content: 'First note' }))
    json(await call(client, 'update_project_notes', { mode: 'append', content: 'Second note' }))
    const project = json<{ notes: string, version: number }>(await call(client, 'get_project'))
    expect(project.notes).toBe('First note\n\nSecond note')

    const stale = await call(client, 'update_project_notes', { mode: 'replace', content: 'x', expectedVersion: appended.version })
    expect(stale.isError).toBe(true)
    expect(stale.text).toContain('Second note')
    const replaced = json<{ version: number }>(await call(client, 'update_project_notes', {
      mode: 'replace',
      content: 'Clean',
      expectedVersion: project.version,
    }))
    expect(replaced.version).toBe(project.version + 1)
    expect((await call(client, 'update_project_notes', { mode: 'replace', content: 'no version' })).isError).toBe(true)
  })
})

describe('mcp server: shared secrets', () => {
  let flaggedId: string
  let unflaggedId: string

  beforeEach(async () => {
    flaggedId = (await createAccount(ownerCtx, 'demo', { service: 'Stripe', username: 'dev', secret: 'sk_test_123', shareWithClaude: true })).id
    unflaggedId = (await createAccount(ownerCtx, 'demo', { service: 'Bank', secret: 'pin-0000' })).id
  })

  it('denies both tools to a token without allowSecrets', async () => {
    const client = await connect(mcpCtx({ allowSecrets: false }))
    const list = await call(client, 'list_shared_secrets')
    expect(list.isError).toBe(true)
    expect(list.text).toContain('Forbidden')
    const get = await call(client, 'get_shared_secret', { accountId: flaggedId, reason: 'DEM-1 deploy' })
    expect(get.isError).toBe(true)
    expect(get.text).not.toContain('sk_test_123')
  })

  it('lists only flagged accounts (no values), denies unflagged ones and logs every access', async () => {
    const client = await connect(mcpCtx({ allowSecrets: true }))
    const list = await call(client, 'list_shared_secrets')
    const accounts = json<{ accounts: Array<{ accountId: string, service: string }> }>(list).accounts
    expect(accounts.map(a => a.service)).toEqual(['Stripe'])
    expect(list.text).not.toContain('sk_test_123')

    const denied = await call(client, 'get_shared_secret', { accountId: unflaggedId, reason: 'curious' })
    expect(denied.isError).toBe(true)
    expect(denied.text).not.toContain('pin-0000')

    const got = await call(client, 'get_shared_secret', { accountId: flaggedId, reason: 'DEM-1 configure webhooks' })
    expect(json<{ secret: string, service: string }>(got)).toMatchObject({ secret: 'sk_test_123', service: 'Stripe' })
    expect(got.text).toContain('Do not repeat it')

    const audit = (await listAccounts(ownerCtx, 'demo')).find(a => a.id === flaggedId)
    expect(audit).toMatchObject({ accessCount: 1 })
    expect(audit?.lastAccessedSource).toContain('mcp:test-token')
    expect(audit?.lastAccessedSource).toContain('DEM-1 configure webhooks')
    const untouched = (await listAccounts(ownerCtx, 'demo')).find(a => a.id === unflaggedId)
    expect(untouched?.accessCount).toBe(0)
  })

  it('never leaks secrets through other tools', async () => {
    const client = await connect(mcpCtx({ allowSecrets: true }))
    for (const name of ['get_context', 'get_project', 'list_projects', 'list_tasks']) {
      const outcome = await call(client, name)
      expect(outcome.text, name).not.toContain('sk_test_123')
    }
  })
})

describe('mcp over HTTP (createTaskManagerMcpHandler)', () => {
  it('serves tools through the stateless handler with the identity from authInfo', async () => {
    const token = { tokenId: 'tok-1', tokenName: 'laptop', userId: t.ownerId, allowSecrets: false }
    const handler = createTaskManagerMcpHandler(actor => makeCtx(t.db, actor))
    const fetchFn = (input: string | URL | Request, init?: RequestInit) =>
      handler.fetch(new Request(input, init), { authInfo: mcpAuthInfo(token, 'demo') })
    const client = new Client({ name: 'http-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), { fetch: fetchFn }))
    clients.push(client)

    const created = json<CreatedTask>(await call(client, 'create_task', { title: 'Over HTTP' }))
    expect(created.key).toBe('DEM-1')
    expect((await getTask(ownerCtx, 'DEM-1')).createdBy).toBe('mcp:laptop')
    const context = json<{ project: { slug: string } }>(await call(client, 'get_context'))
    expect(context.project.slug).toBe('demo')
    await handler.close()
  })
})

describe('mcp actor helpers', () => {
  it('builds the actor and round-trips it through AuthInfo', () => {
    const token = { tokenId: 'id-1', tokenName: 'work pc', userId: 'u1', allowSecrets: true }
    expect(mcpActorFromToken(token, 'demo')).toEqual({
      kind: 'mcp',
      userId: 'u1',
      tokenId: 'id-1',
      tokenName: 'work pc',
      allowSecrets: true,
      defaultProject: 'demo',
      source: 'mcp:work pc',
    })
    const info = mcpAuthInfo(token, null)
    expect(info.token).toBe('id-1')
    expect(mcpActorFromAuthInfo(info)).toEqual(mcpActorFromToken(token, null))
    expect(mcpActorFromAuthInfo(undefined)).toBeNull()
    expect(mcpActorFromAuthInfo({ token: 'x', clientId: 'x', scopes: [], extra: { tokenId: 1 } })).toBeNull()
  })

  it('parses the default project and ignores invalid values', () => {
    expect(parseDefaultProject('Demo')).toBe('demo')
    expect(parseDefaultProject(['my-app', 'x'])).toBe('my-app')
    expect(parseDefaultProject('')).toBeNull()
    expect(parseDefaultProject('../etc')).toBeNull()
    expect(parseDefaultProject(undefined)).toBeNull()
  })

  it('compactJson drops nulls', () => {
    expect(compactJson({ a: 1, b: null, c: { d: null, e: 'x' } })).toBe('{"a":1,"c":{"e":"x"}}')
  })
})
