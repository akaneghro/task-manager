// Write-transaction helpers shared by services (SQLite / libSQL).

import { and, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { Db } from '../db'
import { projects, taskLinks, tasks } from '../db/schema'
import type { BlockEdge } from '../../shared/utils/dependencies'

const SQLITE_BUSY_RE = /SQLITE_BUSY|database is locked/i

/**
 * Write transactions take the SQLite write lock up front. With the default DEFERRED mode two concurrent
 * transactions both start as readers and SQLite answers SQLITE_BUSY immediately when they try to upgrade.
 */
export const IMMEDIATE = { behavior: 'immediate' } as const

/** Retries a write transaction when SQLite reports the database as busy (exponential backoff with jitter). */
export async function withBusyRetry<T>(fn: () => Promise<T>, attempts = 12): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    }
    catch (error) {
      const message = error instanceof Error ? `${error.message} ${String((error as { code?: unknown }).code ?? '')}` : ''
      if (attempt >= attempts || !SQLITE_BUSY_RE.test(message)) throw error
      await new Promise(resolve => setTimeout(resolve, Math.min(200, 5 * 2 ** attempt) * (0.5 + Math.random())))
    }
  }
}

const fromTask = alias(tasks, 'from_task')
const toTask = alias(tasks, 'to_task')
const fromProject = alias(projects, 'from_project')
const toProject = alias(projects, 'to_project')

/**
 * Every live `blocks` edge: links whose two tasks and their projects are not soft-deleted. Deleted tasks are
 * invisible everywhere, so they must not form hidden paths in cycle detection either.
 */
export async function loadLiveBlockEdges(db: Pick<Db, 'select'>): Promise<BlockEdge[]> {
  return db.select({ from: taskLinks.fromTaskId, to: taskLinks.toTaskId })
    .from(taskLinks)
    .innerJoin(fromTask, eq(fromTask.id, taskLinks.fromTaskId))
    .innerJoin(toTask, eq(toTask.id, taskLinks.toTaskId))
    .innerJoin(fromProject, eq(fromProject.id, fromTask.projectId))
    .innerJoin(toProject, eq(toProject.id, toTask.projectId))
    .where(and(
      eq(taskLinks.type, 'blocks'),
      isNull(fromTask.deletedAt),
      isNull(toTask.deletedAt),
      isNull(fromProject.deletedAt),
      isNull(toProject.deletedAt),
    ))
}
