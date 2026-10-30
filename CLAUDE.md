# Task Manager

Personal **Projects + Tasks** manager for a freelancer, with a remote **MCP server** so each Claude Code
session opened in one of the user's repos can read/create/update that project's tasks, while the user edits
them by hand in the web UI with a global view. Projects can be shared read-only (+comments) with invited
GitHub users and through public read-only links.

## Stack

- **Nuxt 4** full-stack (SSR + Nitro server routes), `app/` srcDir, `server/`, `shared/`
- **Drizzle ORM** (stable 0.45) + **libSQL**: local SQLite file in dev, **Turso** in the cloud
- **MCP**: `@modelcontextprotocol/server` v2 (`createMcpHandler`, stateless Streamable HTTP, `registerTool` + zod v4)
- **Auth**: `nuxt-auth-utils` (GitHub OAuth, sealed cookie sessions)
- **i18n**: `@nuxtjs/i18n` v10, `no_prefix`, default `es`, also `en`
- **State**: Pinia 4 + composables (`useFetch` / `$fetch`)
- **Styling**: Tailwind CSS 4 (CSS-first config in `app/assets/css/main.css`), `primary-*` = sky palette,
  `dark` class strategy, utilities `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `input`, `label`, `card`.
  No component library. Icons: `<Icon name="..." />` (inline SVG map in `app/components/Icon.vue`).
- **Kanban DnD**: `vue-draggable-plus`
- **Markdown**: unified + remark-gfm + rehype-sanitize (always sanitized)
- **Tests**: Vitest 5 (projects `server` = node, `app` = happy-dom); **Lint**: `@nuxt/eslint` (stylistic, no `any`)
- **Package manager**: pnpm. Scripts in `scripts/` run with `tsx`.

## Scripts

| Script | What |
|---|---|
| `pnpm dev` | Nuxt dev server on http://localhost:3000 |
| `pnpm build` / `pnpm preview` | Production build / preview |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Must pass before committing |
| `pnpm db:generate` | Generate a migration from `server/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to `NUXT_DATABASE_URL` |
| `pnpm db:seed` | Ensure the Inbox project exists (+ optional demo data with `--demo`) |
| `pnpm gen:keys` | Print a fresh `NUXT_SESSION_PASSWORD` and `NUXT_VAULT_KEY` |
| `pnpm connect <repo> <slug>` | Write the MCP config (`.mcp.json`) of another repo |
| `pnpm service:install` / `service:update` / `service:status` ... | Always-on local service: Windows logon task `TaskManager` -> `scripts/service-run.mjs` supervisor -> production build on `127.0.0.1:3000`, logs in `data/logs/` |

The service and `pnpm dev` share port 3000: run `pnpm service:stop` before `pnpm dev`, and `pnpm service:update`
after code changes so the running build is current.

## Architecture

```
app/                    Vue app (pages, layouts, components, composables, stores, utils)
shared/utils/           enums.ts, taskKey.ts, permissions.ts (Actor + can()), dependencies.ts, position.ts
shared/schemas/         zod schemas shared by REST, MCP and UI (common, project, task, token)
shared/types/dto.ts     DTOs returned by services / REST / MCP
server/db/              schema.ts, index.ts (createDb), migrations/
server/services/        domain logic: plain functions (ctx: ServiceContext, input) -> DTO. context.ts = ServiceError, assertCan
server/utils/           Nitro helpers: db.ts (useDb), crypto.ts, actor.ts (session/share/bearer -> Actor), http.ts
server/api/**           REST endpoints (thin: validate with zod -> call service -> return DTO)
server/routes/mcp.ts    MCP endpoint (bearer token only)
server/mcp/             buildMcpServer(ctx), instructions, prompts, tools/*
scripts/                connect.ts, gen-keys.ts, migrate.ts, seed.ts (+ scripts/lib/* pure, tested)
i18n/locales/{es,en}/   app.json (shell, projects, settings, auth, public) and tasks.json (tasks UI)
```

### Layering rules

- `server/services/**`, `server/mcp/**`, `server/db/**`, `server/utils/crypto.ts`, `shared/**` and `scripts/**` use
  **relative imports only** (no Nitro/Nuxt auto-imports), so Vitest, tsx and drizzle-kit can load them.
- `server/api/**`, `server/routes/**`, `server/middleware/**`, `server/plugins/**` may use Nitro auto-imports
  (`defineEventHandler`, `useRuntimeConfig`, `readValidatedBody`, `getValidatedQuery`, `getUserSession`...).
- Services enforce permissions themselves with `assertCan(ctx, action, { projectId })`; routes never skip a service.
- Every service throws `ServiceError(code, message, details?)`; REST converts it with `toHttpError()` from
  `server/utils/http.ts` (`statusCode` = error.status, `data` = `{ code, message, details }`).
- Dates: DB uses `Date` (timestamp_ms); DTOs use ISO strings; due dates are `YYYY-MM-DD` strings.

### Domain rules

- Task key = `<project.key>-<number>`; numbers are allocated atomically from `projects.next_task_number`.
- `tasks.version` increments on every change of task scalar fields (title, description, status, priority, type,
  size, executor, assignee, due date, blocker, position via move). Checklist and comments only bump `updated_at`.
  Updates carry `expectedVersion`; a mismatch throws `ServiceError('conflict', ..., current TaskDetailDto)` -> HTTP 409.
- Soft delete (`deleted_at`) for tasks, projects, accounts, comments. Deleted rows are invisible everywhere.
- Inbox project (`slug: inbox`, `key: INBOX`, `is_inbox`) always exists, cannot be deleted/archived/renamed slug.
  Reserved project slugs: `inbox` and `all` (`all` = every project in listings and `/api/sync`).
- `done`/`cancelled` are closed statuses: set `completed_at` when entering `done`, clear it when leaving.
- "blocked by" dependencies are `task_links` rows with `type = 'blocks'` (`from` blocks `to`); cycles are rejected
  (checked inside an IMMEDIATE transaction, ignoring links whose ends are soft-deleted).
- Sources: `created_by` / `updated_by` / `author_source` = `user:<userId>` or `mcp:<tokenName>`. Public share links
  only ever see them reduced to `user:` / `mcp:` (no ids, token names or member logins).
- A `member` assignee must be an accepted, active member of the task's project.
- Server-side calendar dates ("today") use `NUXT_TIMEZONE` (default `Europe/Madrid`), like the UI's local dates.
- User-facing ServiceErrors carry `details: { reason }` (`because('...')`); the UI translates the reason
  (`errors.reasons.*`), the English message is for logs and MCP.

### Permissions (shared/utils/permissions.ts)

| | Owner | Commenter | Viewer | Public link | MCP token |
|---|---|---|---|---|---|
| See projects / tasks | all | invited projects | invited projects | that project (tasks only) | all |
| Notes, links, client | yes | yes | yes | no | yes |
| Create/edit tasks, checklist, deps | yes | no | no | no | yes |
| Create project / edit notes & links | yes | no | no | no | yes (append notes, add links) |
| Edit project fields, delete/archive | yes | no | no | no | no |
| Comments read / write | yes | yes / yes (own edit) | yes / no | no | yes / yes |
| Vault | yes (reveal logged) | no | no | no | only `share_with_claude` secrets and only with an `allow_secrets` token (logged) |
| Members, share links, tokens | yes | no | no | no | no |

Login gate: the owner is `NUXT_OWNER_GITHUB_LOGIN` (then pinned by `github_id`; a dev-login owner row with the
placeholder `github_id` 0 is adopted by the first matching GitHub login); anyone else needs an active
`project_members` invitation. Invitations are never pre-linked to a user: an unlinked invitation matches the live
GitHub login once and is then bound to that user id (a later account reusing the login gets nothing).

## REST API contract (`server/api/**`)

All responses are DTOs from `shared/types/dto.ts`. Errors: `{ statusCode, data: { code, message, details } }`.
Cookie-authenticated non-GET requests must pass the Origin check (`server/middleware/csrf.ts`, no exemptions).
Every response gets security headers (`server/middleware/security-headers.ts`); `/mcp`, `/api/connect/check`,
`/api/public/**` and `/auth/**` are rate limited per IP (`server/middleware/rate-limit.ts`, 429).

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /api/me` | | `{ user: UserDto }` |
| `GET /api/projects` | `?status=a,b&includeArchived=` | `ProjectSummaryDto[]` (Inbox first) |
| `POST /api/projects` | `createProjectSchema` | `ProjectDetailDto` |
| `GET /api/projects/:slug` | | `ProjectDetailDto` |
| `PATCH /api/projects/:slug` | `updateProjectSchema` | `ProjectDetailDto` (409 on conflict) |
| `DELETE /api/projects/:slug` | | `{ ok: true }` (soft delete) |
| `PUT /api/projects/:slug/links` | `replaceProjectLinksSchema` | `ProjectLinkDto[]` |
| `GET/POST /api/projects/:slug/members` | `inviteMemberSchema` | `MemberDto[]` / `MemberDto` |
| `PATCH/DELETE /api/members/:id` | `updateMemberSchema` | `MemberDto` / `{ ok: true }` (revoke) |
| `GET/POST /api/projects/:slug/share-links` | `createShareLinkSchema` | `ShareLinkDto[]` / `ShareLinkDto` |
| `DELETE /api/share-links/:id` | | `{ ok: true }` (revoke) |
| `GET/POST /api/projects/:slug/accounts` | `createAccountSchema` | `AccountDto[]` / `AccountDto` |
| `PATCH/DELETE /api/accounts/:id` | `updateAccountSchema` | `AccountDto` / `{ ok: true }` |
| `POST /api/accounts/:id/reveal` | | `{ secret: string }` (logged) |
| `GET /api/tasks` | `listTasksQuerySchema` (`project` slug or omitted = all visible; `closedLast` sorts done/cancelled last) | `TaskListDto` |
| `POST /api/tasks` | `createTaskSchema` (`project` slug, default Inbox) | `TaskDetailDto` |
| `GET /api/tasks/:ref` | ref = key (`ABC-12`) or id | `TaskDetailDto` |
| `PATCH /api/tasks/:ref` | `updateTaskSchema` | `TaskDetailDto` (409 `ConflictDto<TaskDetailDto>`) |
| `POST /api/tasks/:ref/status` | `setStatusSchema` | `TaskDetailDto` |
| `POST /api/tasks/:ref/move` | `moveTaskSchema` | `TaskSummaryDto` |
| `DELETE /api/tasks/:ref` | | `{ ok: true }` |
| `POST /api/tasks/:ref/checklist` | `addChecklistItemsSchema` | `ChecklistItemDto[]` (full list) |
| `PATCH/DELETE /api/checklist/:id` | `updateChecklistItemSchema` | `ChecklistItemDto` / `{ ok: true }` |
| `POST /api/tasks/:ref/links` | `linkTasksSchema` | `TaskDetailDto` |
| `DELETE /api/task-links/:id` | | `{ ok: true }` |
| `GET/POST /api/tasks/:ref/comments` | `commentBodySchema` | `CommentDto[]` / `CommentDto` |
| `PATCH/DELETE /api/comments/:id` | `commentBodySchema` | `CommentDto` / `{ ok: true }` |
| `GET/POST /api/tokens` | `createTokenSchema` | `TokenDto[]` / `CreatedTokenDto` (plain token once) |
| `DELETE /api/tokens/:id` | | `{ ok: true }` (revoke) |
| `GET /api/sync` | `?project=` | `SyncDto` |
| `GET /api/public/:token` | | `PublicProjectDto` |
| `GET /api/public/:token/tasks/:key` | | `TaskDetailDto` (no comments, no hidden deps) |
| `GET /api/connect/check` | Bearer token, `?project=` | `{ tokenName, projectExists }` |

Auth routes: `GET /auth/github` (OAuth), `POST /api/auth/logout` is replaced by `useUserSession().clear()`,
`GET /auth/dev` (dev only, `NUXT_DEV_LOGIN=true`, `import.meta.dev`) logs in as the owner without GitHub.

## MCP server

- Endpoint `POST /mcp` (Streamable HTTP, stateless). Modern-protocol clients get JSON bodies; legacy 2025-era
  clients (Claude Code) get single SSE-framed responses (`Accept: application/json, text/event-stream`).
  Auth: `Authorization: Bearer tm_...` (401 carries `error="invalid_token"`; `/.well-known/*` answers a JSON 404).
- Default project from header `X-TM-Project: <slug>` (fallback `?project=`); an invalid slug is a 400. Tools also
  accept a project key where a slug is expected.
- Tools: `get_context`, `list_projects`, `get_project`, `list_tasks`, `get_task`, `search_tasks`, `create_task`,
  `update_task`, `set_status`, `add_checklist_items`, `toggle_checklist_item`, `add_comment`, `link_tasks`,
  `unlink_tasks`, `create_project`, `update_project_notes`, `update_project_links`, `list_shared_secrets`,
  `get_shared_secret`. Prompts: `next-task`, `wrap-up`. Reference: `docs/mcp.md` (keep it in sync with the schemas).
- Tools are thin wrappers over services. Nothing deletes tasks, projects, comments or vault entries; `unlink_tasks`
  (dependency links) is the only removal and is annotated `destructiveHint: true`.

## Security Rules

- **Never** log tokens, secrets, session data or decrypted values. Never return `secret_enc` in any DTO.
- Decrypt only inside the accounts service (`revealSecret`, `getSharedSecret`), and record every access.
- Public and member queries never touch `project_accounts`.
- All input goes through zod schemas from `shared/schemas`.
- Markdown is rendered only through the sanitizing pipeline (`app/utils/markdown.ts`); links limited to http(s)/mailto/#.
- `/mcp` is bearer-only and never reads cookies; API tokens are stored as SHA-256 hashes.
- Never read, print or modify `.env` files (a hook blocks it). Use `.env.example` for documentation.

## Git Workflow

- **`main`** — always stable. Never commit directly.
- **`feat/xxx`** / **`fix/xxx`** — one branch per task, granular conventional commits (`feat:`, `fix:`, `docs:`...).
- Run `pnpm typecheck && pnpm lint && pnpm test` before committing. The user decides when to merge.

## Conventions

- TypeScript strict; never `any` (use `unknown` + narrowing / zod).
- UI strings only through i18n keys (`$t` / `useI18n`), Spanish is the default locale; keep es/en in sync.
- Components: `<script setup lang="ts">`, Composition API, Tailwind utility classes, dark mode variants everywhere.
- Accessible markup: labels for inputs, `aria-label` on icon-only buttons, keyboard reachable controls.
- Tests live next to the code in `__tests__/` folders.
