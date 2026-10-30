// Data transfer objects returned by the services. REST returns them as JSON (dates become ISO strings,
// hence the `string` timestamps), the MCP server serialises them, and the UI consumes them.

import type {
  AssigneeKind,
  MemberRole,
  ProjectLinkKind,
  ProjectStatus,
  TaskExecutor,
  TaskPriority,
  TaskSize,
  TaskStatus,
  TaskType,
  UserRole,
} from '../utils/enums'

/** ISO-8601 timestamp string. */
export type IsoDateTime = string
/** `YYYY-MM-DD`. */
export type DateOnly = string

export interface UserDto {
  id: string
  githubLogin: string
  name: string | null
  avatarUrl: string | null
  role: UserRole
}

/** What the current viewer may do in a project (computed server-side with `can()`). */
export interface ProjectCapabilities {
  edit: boolean
  comment: boolean
  manage: boolean
  vault: boolean
}

export type TaskCountsByStatus = Record<TaskStatus, number>

export interface ProjectLinkDto {
  id: string
  kind: ProjectLinkKind
  label: string
  url: string
  position: number
}

export interface ProjectSummaryDto {
  id: string
  slug: string
  key: string
  name: string
  description: string
  status: ProjectStatus
  client: string | null
  color: string | null
  isInbox: boolean
  version: number
  counts: TaskCountsByStatus
  openCount: number
  updatedAt: IsoDateTime
  /** Present for authenticated viewers; omitted for public links. */
  capabilities?: ProjectCapabilities
}

export interface ProjectDetailDto extends ProjectSummaryDto {
  /** Hidden (empty string) for public share links. */
  notes: string
  links: ProjectLinkDto[]
  createdAt: IsoDateTime
  createdBy: string
  updatedBy: string
}

export interface AssigneeDto {
  kind: AssigneeKind
  userId: string | null
  /** Display name: GitHub login for members, free text for externals. */
  name: string | null
}

export interface BlockerDto {
  who: string
  what: string
  since: DateOnly | null
}

export interface TaskLinkRefDto {
  linkId: string
  taskId: string
  key: string
  title: string
  status: TaskStatus
  projectSlug: string
}

export interface TaskSummaryDto {
  id: string
  key: string
  number: number
  projectId: string
  projectSlug: string
  projectKey: string
  projectName: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  size: TaskSize | null
  executor: TaskExecutor
  assignee: AssigneeDto
  dueDate: DateOnly | null
  blocker: BlockerDto | null
  position: number
  version: number
  checklistDone: number
  checklistTotal: number
  /** Keys of open tasks blocking this one. */
  blockedByKeys: string[]
  commentCount: number
  completedAt: IsoDateTime | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  createdBy: string
  updatedBy: string
}

export interface ChecklistItemDto {
  id: string
  text: string
  done: boolean
  position: number
  doneAt: IsoDateTime | null
  doneBy: string | null
}

export interface CommentDto {
  id: string
  taskId: string
  authorSource: string
  author: { login: string | null, avatarUrl: string | null, isClaude: boolean }
  body: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  canEdit: boolean
}

export interface TaskDetailDto extends TaskSummaryDto {
  description: string
  checklist: ChecklistItemDto[]
  blockedBy: TaskLinkRefDto[]
  blocking: TaskLinkRefDto[]
  /** Number of dependencies hidden because the viewer cannot see the other project. */
  hiddenDependencies: number
  comments: CommentDto[]
  capabilities?: ProjectCapabilities
}

export interface TaskListDto {
  items: TaskSummaryDto[]
  total: number
}

export interface MemberDto {
  id: string
  projectId: string
  githubLogin: string
  role: MemberRole
  userId: string | null
  avatarUrl: string | null
  invitedAt: IsoDateTime
  acceptedAt: IsoDateTime | null
}

export interface ShareLinkDto {
  id: string
  projectId: string
  token: string
  url: string
  label: string | null
  lastUsedAt: IsoDateTime | null
  createdAt: IsoDateTime
}

/** Vault entry metadata. Never includes the secret. */
export interface AccountDto {
  id: string
  projectId: string
  service: string
  url: string | null
  username: string | null
  notes: string
  hasSecret: boolean
  shareWithClaude: boolean
  lastAccessedAt: IsoDateTime | null
  lastAccessedSource: string | null
  accessCount: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface TokenDto {
  id: string
  name: string
  tokenPrefix: string
  allowSecrets: boolean
  lastUsedAt: IsoDateTime | null
  expiresAt: IsoDateTime | null
  createdAt: IsoDateTime
}

export interface CreatedTokenDto extends TokenDto {
  /** Plain token, returned only once at creation. */
  token: string
}

export interface SyncDto {
  /** Max `updated_at` across visible tasks/projects/comments (ISO) or null when empty. */
  lastChange: IsoDateTime | null
}

/** Payload of a 409 response / MCP conflict error. */
export interface ConflictDto<T> {
  error: 'version_conflict'
  message: string
  current: T
}

/** Public share-link view. */
export interface PublicProjectDto {
  project: ProjectSummaryDto
  links: ProjectLinkDto[]
  tasks: TaskSummaryDto[]
}
