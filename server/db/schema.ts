import { sql } from 'drizzle-orm'
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
  ASSIGNEE_KINDS,
  MEMBER_ROLES,
  PROJECT_LINK_KINDS,
  PROJECT_STATUSES,
  TASK_EXECUTORS,
  TASK_LINK_TYPES,
  TASK_PRIORITIES,
  TASK_SIZES,
  TASK_STATUSES,
  TASK_TYPES,
  USER_ROLES,
} from '../../shared/utils/enums'

// Conventions:
// - ids are `crypto.randomUUID()` strings
// - timestamps are integer ms (`mode: 'timestamp_ms'` -> Date)
// - date-only values (due dates) are `YYYY-MM-DD` text to avoid timezone bugs
// - `created_by` / `updated_by` hold an actor source: `user:<id>` or `mcp:<tokenName>`

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())
const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())

export const users = sqliteTable('users', {
  id: id(),
  githubId: integer('github_id').notNull(),
  githubLogin: text('github_login').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  email: text('email'),
  role: text('role', { enum: USER_ROLES }).notNull().default('member'),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex('users_github_id_uq').on(t.githubId),
  index('users_login_idx').on(sql`lower(${t.githubLogin})`),
])

export const projects = sqliteTable('projects', {
  id: id(),
  slug: text('slug').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  notes: text('notes').notNull().default(''),
  status: text('status', { enum: PROJECT_STATUSES }).notNull().default('idea'),
  client: text('client'),
  color: text('color'),
  isInbox: integer('is_inbox', { mode: 'boolean' }).notNull().default(false),
  nextTaskNumber: integer('next_task_number').notNull().default(1),
  version: integer('version').notNull().default(1),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
}, t => [
  uniqueIndex('projects_slug_uq').on(t.slug),
  uniqueIndex('projects_key_uq').on(t.key),
  index('projects_status_idx').on(t.status),
])

export const projectLinks = sqliteTable('project_links', {
  id: id(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: PROJECT_LINK_KINDS }).notNull().default('other'),
  label: text('label').notNull(),
  url: text('url').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
}, t => [
  index('project_links_project_idx').on(t.projectId),
])

/** Invitations and memberships. A row with `userId = null` is a pending invitation. */
export const projectMembers = sqliteTable('project_members', {
  id: id(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  githubLogin: text('github_login').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  role: text('role', { enum: MEMBER_ROLES }).notNull().default('viewer'),
  invitedAt: integer('invited_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
}, t => [
  uniqueIndex('project_members_project_login_uq').on(t.projectId, sql`lower(${t.githubLogin})`),
  index('project_members_user_idx').on(t.userId),
])

/** Credentials vault. `secretEnc` is AES-256-GCM ciphertext (`v1:<iv b64>:<ct b64>`), AAD = row id. */
export const projectAccounts = sqliteTable('project_accounts', {
  id: id(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  service: text('service').notNull(),
  url: text('url'),
  username: text('username'),
  notes: text('notes').notNull().default(''),
  secretEnc: text('secret_enc'),
  shareWithClaude: integer('share_with_claude', { mode: 'boolean' }).notNull().default(false),
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp_ms' }),
  lastAccessedSource: text('last_accessed_source'),
  accessCount: integer('access_count').notNull().default(0),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index('project_accounts_project_idx').on(t.projectId),
])

export const tasks = sqliteTable('tasks', {
  id: id(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
  priority: text('priority', { enum: TASK_PRIORITIES }).notNull().default('medium'),
  type: text('type', { enum: TASK_TYPES }).notNull().default('feature'),
  size: text('size', { enum: TASK_SIZES }),
  executor: text('executor', { enum: TASK_EXECUTORS }).notNull().default('ai'),
  assigneeKind: text('assignee_kind', { enum: ASSIGNEE_KINDS }).notNull().default('none'),
  assigneeUserId: text('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  assigneeExternal: text('assignee_external'),
  dueDate: text('due_date'),
  blockerWho: text('blocker_who'),
  blockerWhat: text('blocker_what'),
  blockerSince: text('blocker_since'),
  position: real('position').notNull().default(0),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  version: integer('version').notNull().default(1),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
}, t => [
  uniqueIndex('tasks_project_number_uq').on(t.projectId, t.number),
  index('tasks_project_status_pos_idx').on(t.projectId, t.status, t.position),
  index('tasks_status_idx').on(t.status),
  index('tasks_due_idx').on(t.dueDate),
  index('tasks_updated_idx').on(t.updatedAt),
])

export const taskChecklistItems = sqliteTable('task_checklist_items', {
  id: id(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  position: real('position').notNull().default(0),
  doneAt: integer('done_at', { mode: 'timestamp_ms' }),
  doneBy: text('done_by'),
  createdAt: createdAt(),
}, t => [
  index('checklist_task_pos_idx').on(t.taskId, t.position),
])

/** `fromTaskId` BLOCKS `toTaskId` (so `toTaskId` is "blocked by" `fromTaskId`). */
export const taskLinks = sqliteTable('task_links', {
  id: id(),
  fromTaskId: text('from_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  toTaskId: text('to_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  type: text('type', { enum: TASK_LINK_TYPES }).notNull().default('blocks'),
  createdAt: createdAt(),
  createdBy: text('created_by').notNull(),
}, t => [
  uniqueIndex('task_links_uq').on(t.fromTaskId, t.toTaskId, t.type),
  index('task_links_to_idx').on(t.toTaskId),
  check('task_links_no_self', sql`${t.fromTaskId} <> ${t.toTaskId}`),
])

export const comments = sqliteTable('comments', {
  id: id(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  authorSource: text('author_source').notNull(),
  body: text('body').notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index('comments_task_idx').on(t.taskId, t.createdAt),
])

/** Personal API tokens for the MCP server. Only the SHA-256 hash is stored. */
export const apiTokens = sqliteTable('api_tokens', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  allowSecrets: integer('allow_secrets', { mode: 'boolean' }).notNull().default(false),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('api_tokens_hash_uq').on(t.tokenHash),
  uniqueIndex('api_tokens_user_name_uq').on(t.userId, t.name),
])

/** Public read-only links for one project. */
export const shareLinks = sqliteTable('share_links', {
  id: id(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  label: text('label'),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('share_links_token_uq').on(t.token),
  index('share_links_project_idx').on(t.projectId),
])

export type UserRow = typeof users.$inferSelect
export type ProjectRow = typeof projects.$inferSelect
export type ProjectLinkRow = typeof projectLinks.$inferSelect
export type ProjectMemberRow = typeof projectMembers.$inferSelect
export type ProjectAccountRow = typeof projectAccounts.$inferSelect
export type TaskRow = typeof tasks.$inferSelect
export type ChecklistItemRow = typeof taskChecklistItems.$inferSelect
export type TaskLinkRow = typeof taskLinks.$inferSelect
export type CommentRow = typeof comments.$inferSelect
export type ApiTokenRow = typeof apiTokens.$inferSelect
export type ShareLinkRow = typeof shareLinks.$inferSelect
