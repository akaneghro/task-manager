// Ensures the Inbox project exists; with `--demo` also creates two demo projects with sample tasks.
// Usage: pnpm db:seed [--demo]
// Idempotent: a demo project whose slug (or key) already exists is skipped.

import { or, eq } from 'drizzle-orm'
import { createDb } from '../server/db'
import type { Db } from '../server/db'
import { projectLinks, projects, taskChecklistItems, taskLinks, tasks, users } from '../server/db/schema'
import { toggleChecklistItem } from '../server/services/checklist'
import type { ServiceContext } from '../server/services/context'
import { createProject, ensureInbox } from '../server/services/projects'
import { createTask } from '../server/services/tasks'
import type { ProjectLinkKind, ProjectStatus, TaskExecutor, TaskPriority, TaskSize, TaskStatus, TaskType } from '../shared/utils/enums'
import { POSITION_STEP } from '../shared/utils/position'
import { ArgsError, parseArgs } from './lib/args'
import { closeDb, databaseConfigFromEnv, describeDatabaseUrl, loadProjectEnv } from './lib/env'

/** Actor source written to created_by / updated_by for seeded rows. */
const SYSTEM_SOURCE = 'system'

interface DemoTask {
  /** Local reference used to declare dependencies. */
  ref: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  size: TaskSize | null
  executor: TaskExecutor
  assignee?: 'owner' | 'claude'
  dueInDays?: number
  blocker?: { who: string, what: string, sinceDaysAgo: number }
  checklist?: { text: string, done: boolean }[]
  /** Refs of tasks (same project) that block this one. */
  blockedBy?: string[]
}

interface DemoProject {
  slug: string
  key: string
  name: string
  status: ProjectStatus
  description: string
  notes: string
  client: string | null
  color: string
  links: { kind: ProjectLinkKind, label: string, url: string }[]
  tasks: DemoTask[]
}

const DEMO_PROJECTS: DemoProject[] = [
  {
    slug: 'demo-web',
    key: 'DEMO',
    name: 'Demo Web',
    status: 'development',
    description: 'Marketing website with a small checkout for a fictional client.',
    notes: '## Stack\n\n- Nuxt + Tailwind\n- Payments: provider pending\n\n## Decisions\n\n- Mobile first\n- No CMS for v1',
    client: 'ACME Corp',
    color: '#0284c7',
    links: [
      { kind: 'repo', label: 'GitHub', url: 'https://github.com/example/demo-web' },
      { kind: 'staging', label: 'Staging', url: 'https://staging.demo-web.example.com' },
    ],
    tasks: [
      {
        ref: 'ci',
        title: 'Set up CI pipeline',
        description: 'Lint, typecheck and tests on every push.',
        status: 'done',
        priority: 'high',
        type: 'maintenance',
        size: 'S',
        executor: 'ai',
      },
      {
        ref: 'hero',
        title: 'Landing page hero section',
        description: 'Headline, sub-headline, primary CTA and a responsive illustration.',
        status: 'in_progress',
        priority: 'high',
        type: 'feature',
        size: 'M',
        executor: 'mixed',
        assignee: 'claude',
        checklist: [
          { text: 'Layout and typography', done: true },
          { text: 'Responsive illustration', done: true },
          { text: 'CTA tracking', done: false },
          { text: 'Dark mode review', done: false },
        ],
      },
      {
        ref: 'menu',
        title: 'Fix mobile menu overflow',
        description: 'The menu overflows the viewport on screens narrower than 360px.',
        status: 'todo',
        priority: 'urgent',
        type: 'bug',
        size: 'XS',
        executor: 'ai',
        dueInDays: 2,
      },
      {
        ref: 'checkout',
        title: 'Checkout flow',
        description: 'Cart summary, customer details and order confirmation.',
        status: 'in_review',
        priority: 'high',
        type: 'feature',
        size: 'XL',
        executor: 'mixed',
        assignee: 'owner',
        dueInDays: 7,
      },
      {
        ref: 'e2e',
        title: 'End-to-end tests for checkout',
        status: 'todo',
        priority: 'medium',
        type: 'test',
        size: 'L',
        executor: 'ai',
        blockedBy: ['checkout'],
        checklist: [
          { text: 'Happy path', done: false },
          { text: 'Validation errors', done: false },
        ],
      },
      {
        ref: 'payments',
        title: 'Integrate payment provider',
        status: 'blocked',
        priority: 'high',
        type: 'feature',
        size: 'M',
        executor: 'human',
        blocker: { who: 'ACME Corp', what: 'Send the payment provider API keys', sinceDaysAgo: 3 },
      },
      {
        ref: 'readme',
        title: 'Update README with deploy steps',
        status: 'backlog',
        priority: 'low',
        type: 'docs',
        size: 'XS',
        executor: 'ai',
      },
    ],
  },
  {
    slug: 'idea-box',
    key: 'IDEA',
    name: 'Idea Box',
    status: 'idea',
    description: 'Ideas worth exploring some day.',
    notes: '',
    client: null,
    color: '#a855f7',
    links: [],
    tasks: [
      {
        ref: 'offline',
        title: 'Explore offline-first sync',
        description: 'Compare CRDT libraries vs. simple last-write-wins with versions.',
        status: 'backlog',
        priority: 'low',
        type: 'idea',
        size: 'L',
        executor: 'human',
      },
      {
        ref: 'pomodoro',
        title: 'Pomodoro timer integration',
        status: 'backlog',
        priority: 'medium',
        type: 'idea',
        size: 'M',
        executor: 'mixed',
      },
    ],
  },
]

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000)
}

/** Owner-like context whose writes are attributed to `system`. */
function systemContext(db: Db, ownerId: string): ServiceContext {
  return {
    db,
    actor: { kind: 'owner', userId: ownerId, source: SYSTEM_SOURCE },
    siteUrl: process.env.NUXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
  }
}

/** Preferred path (an owner user exists): goes through the services, so every domain rule applies. */
async function seedWithServices(ctx: ServiceContext, demo: DemoProject, now: Date): Promise<void> {
  await createProject(ctx, {
    name: demo.name,
    key: demo.key,
    slug: demo.slug,
    status: demo.status,
    description: demo.description,
    notes: demo.notes,
    client: demo.client,
    color: demo.color,
    links: demo.links,
  })
  const keyByRef = new Map<string, string>()
  for (const task of demo.tasks) {
    const created = await createTask(ctx, {
      project: demo.slug,
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      type: task.type,
      size: task.size,
      executor: task.executor,
      assignee: task.assignee ? { kind: task.assignee } : undefined,
      dueDate: task.dueInDays === undefined ? null : dateOnly(addDays(now, task.dueInDays)),
      blocker: task.blocker
        ? { who: task.blocker.who, what: task.blocker.what, since: dateOnly(addDays(now, -task.blocker.sinceDaysAgo)) }
        : null,
      checklist: task.checklist?.map(item => item.text),
      blockedBy: task.blockedBy?.map((ref) => {
        const key = keyByRef.get(ref)
        if (!key) throw new Error(`Unknown dependency ${ref} -> ${task.ref}`)
        return key
      }),
    })
    keyByRef.set(task.ref, created.key)
    for (const [index, item] of (task.checklist ?? []).entries()) {
      if (item.done) await toggleChecklistItem(ctx, created.key, { index: index + 1, done: true })
    }
  }
}

/** Fallback (no owner user yet): plain inserts in one transaction. */
async function seedDirect(db: Db, demo: DemoProject, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({
      slug: demo.slug,
      key: demo.key,
      name: demo.name,
      status: demo.status,
      description: demo.description,
      notes: demo.notes,
      client: demo.client,
      color: demo.color,
      nextTaskNumber: demo.tasks.length + 1,
      createdBy: SYSTEM_SOURCE,
      updatedBy: SYSTEM_SOURCE,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: projects.id })
    if (!project) throw new Error(`Could not insert project ${demo.slug}`)

    if (demo.links.length > 0) {
      await tx.insert(projectLinks).values(demo.links.map((link, i) => ({ projectId: project.id, ...link, position: i })))
    }

    const idByRef = new Map<string, string>()
    const positionByStatus = new Map<TaskStatus, number>()
    for (const [index, task] of demo.tasks.entries()) {
      const position = (positionByStatus.get(task.status) ?? 0) + POSITION_STEP
      positionByStatus.set(task.status, position)
      const [row] = await tx.insert(tasks).values({
        projectId: project.id,
        number: index + 1,
        title: task.title,
        description: task.description ?? '',
        status: task.status,
        priority: task.priority,
        type: task.type,
        size: task.size,
        executor: task.executor,
        assigneeKind: task.assignee ?? 'none',
        dueDate: task.dueInDays === undefined ? null : dateOnly(addDays(now, task.dueInDays)),
        blockerWho: task.blocker?.who ?? null,
        blockerWhat: task.blocker?.what ?? null,
        blockerSince: task.blocker ? dateOnly(addDays(now, -task.blocker.sinceDaysAgo)) : null,
        position,
        completedAt: task.status === 'done' ? now : null,
        createdBy: SYSTEM_SOURCE,
        updatedBy: SYSTEM_SOURCE,
        createdAt: now,
        updatedAt: now,
      }).returning({ id: tasks.id })
      if (!row) throw new Error(`Could not insert task ${task.ref}`)
      idByRef.set(task.ref, row.id)

      if (task.checklist?.length) {
        await tx.insert(taskChecklistItems).values(task.checklist.map((item, i) => ({
          taskId: row.id,
          text: item.text,
          done: item.done,
          position: (i + 1) * POSITION_STEP,
          doneAt: item.done ? now : null,
          doneBy: item.done ? SYSTEM_SOURCE : null,
        })))
      }
    }

    for (const task of demo.tasks) {
      for (const blockerRef of task.blockedBy ?? []) {
        const fromTaskId = idByRef.get(blockerRef)
        const toTaskId = idByRef.get(task.ref)
        if (!fromTaskId || !toTaskId) throw new Error(`Unknown dependency ${blockerRef} -> ${task.ref}`)
        await tx.insert(taskLinks).values({ fromTaskId, toTaskId, type: 'blocks', createdBy: SYSTEM_SOURCE })
      }
    }
  })
}

/** Creates one demo project with its tasks. Returns `false` when its slug or key is already taken. */
async function seedDemoProject(db: Db, ownerId: string | null, demo: DemoProject, now: Date): Promise<boolean> {
  const [existing] = await db.select({ slug: projects.slug, key: projects.key }).from(projects)
    .where(or(eq(projects.slug, demo.slug), eq(projects.key, demo.key)))
    .limit(1)
  if (existing) {
    console.log(`  - ${demo.name}: skipped (project ${existing.slug} / ${existing.key} already exists)`)
    return false
  }
  if (ownerId) await seedWithServices(systemContext(db, ownerId), demo, now)
  else await seedDirect(db, demo, now)
  console.log(`  + ${demo.name} (${demo.key}, /${demo.slug}): ${demo.tasks.length} tasks`)
  return true
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), { boolean: ['demo'] })
  if (args.positionals.length > 0) throw new ArgsError(`Unexpected arguments: ${args.positionals.join(' ')}`)

  loadProjectEnv()
  const config = databaseConfigFromEnv()
  console.log(`Database: ${describeDatabaseUrl(config.url)}`)
  const db = createDb(config)
  try {
    const inbox = await ensureInbox(db)
    console.log(`Inbox: ${inbox.name} (${inbox.key}, /${inbox.slug})`)
    if (!args.booleans.demo) {
      console.log('Tip: run `pnpm db:seed --demo` to add demo projects and tasks.')
      return
    }
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).limit(1)
    console.log(`Demo data (${owner ? 'through the services' : 'direct inserts, no owner user yet'}):`)
    const now = new Date()
    let created = 0
    for (const demo of DEMO_PROJECTS) {
      if (await seedDemoProject(db, owner?.id ?? null, demo, now)) created++
    }
    console.log(`Done: ${created} demo project(s) created.`)
  }
  finally {
    closeDb(db)
  }
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`)
  if (error instanceof Error && /no such table/i.test(error.message)) console.error('Run `pnpm db:migrate` first.')
  process.exitCode = 1
})
