# MCP reference

Task Manager exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so that every Claude Code
session opened in one of your repositories can read and update that project's tasks.

- **Endpoint:** `POST <base-url>/mcp` (for example `http://localhost:3000/mcp`)
- **Transport:** Streamable HTTP, stateless (no session to keep alive). Clients on the modern protocol
  (2026-07-28) get a plain JSON body; legacy 2025-era clients, Claude Code included, get each answer as a single
  SSE-framed response, so requests must send `Accept: application/json, text/event-stream`.
- **Auth:** personal API token, `Authorization: Bearer tm_...` (cookies are never read on this route)
- **Default project:** `X-TM-Project: <slug>` header (fallback: `?project=<slug>` query parameter)

> The authoritative list of tools and their JSON schemas is what the server returns for `tools/list`.
> This page explains them; field names match the zod schemas in `shared/schemas/`.

## Authentication

1. In the web app open **Settings → API tokens** and create a token. It is shown **once**; copy it.
2. Optional: tick **Allow secrets** if Claude may read vault secrets flagged "share with Claude" (see below).
3. Optional: set an expiry. Tokens can be revoked at any time.

Only the SHA-256 hash of the token is stored. A missing, unknown, revoked or expired token gets
`401 Unauthorized` with `WWW-Authenticate: Bearer realm="task-manager", error="invalid_token", error_description="..."`.
Claude Code shows that as **needs authentication** (see Troubleshooting). There is no OAuth: `/.well-known/*`
discovery probes get a JSON 404.

An MCP token acts on behalf of the owner with a reduced permission set:

| Can | Cannot |
|---|---|
| Read every project, task, checklist, dependency and comment | Delete or archive tasks, projects, comments or vault entries |
| Create and edit tasks and checklists, add and remove dependencies | Edit project fields (name, slug, status, client...) |
| Create projects, append to / edit project notes, add or update project links | Manage members, share links or tokens |
| Comment | Read vault secrets, except the shared ones with an `allowSecrets` token |

Every write is attributed to `mcp:<token name>` (`created_by`, `updated_by`, comment author).

## Headers

| Header | Required | Meaning |
|---|---|---|
| `Authorization` | yes | `Bearer tm_...` |
| `X-TM-Project` | recommended | Project slug used when a tool call omits `project`. Claude can still work on other projects when you ask it to. A value that is not a valid slug (e.g. `Web_Shop`) is rejected with `400 invalid_project` instead of being ignored. |
| `Accept` | sent by clients | `application/json, text/event-stream` (standard Streamable HTTP) |

## Configuring Claude Code

The easiest way is the helper script, run from the task-manager folder:

```bash
pnpm connect <folder> [project-slug]                  # slug defaults to the folder name; token from TM_TOKEN or asked (hidden)
pnpm connect ../my-site my-site --url https://tm.example.com
pnpm connect ../my-site my-site --env-token           # writes "Bearer ${TM_TOKEN}" instead of the token
```

The folder can be a git repo or any folder where you open Claude Code (for example one holding several repos).
The project does not have to exist yet: `get_context` then returns `missingProject` and Claude offers to create it
with `create_project` using that exact slug.

| Option | Default | Description |
|---|---|---|
| `--url <base>` | `TM_URL` or `http://localhost:3000` | Task Manager base URL |
| `--name <name>` | `task-manager` | Server name inside `.mcp.json` (tools appear as `mcp__<name>__*`) |
| `--env-token` | off | Do not store the token in the file; Claude Code expands `${TM_TOKEN}` from its environment |
| `--force` | off | Write the config even if the server is unreachable or the project does not exist yet |
| `--dry-run` | off | Print what would change (token redacted) without writing |

The token is taken from the `TM_TOKEN` environment variable or asked for interactively. The script:

1. checks the repo path (warns when there is no `.git`);
2. verifies the token and the project with `GET /api/connect/check?project=<slug>`;
3. merges the server into `<repo>/.mcp.json`, keeping other servers, key order and line endings
   (it aborts without writing if the existing file is not valid JSON);
4. adds `.mcp.json` to `<repo>/.gitignore` (the file contains your token);
5. warns if `.mcp.json` is already tracked by git (`git rm --cached .mcp.json`).

### Manual `.mcp.json`

```json
{
  "mcpServers": {
    "task-manager": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer tm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "X-TM-Project": "my-site"
      }
    }
  }
}
```

Keep `.mcp.json` out of git. With `"Authorization": "Bearer ${TM_TOKEN}"` the file holds no secret, but every
machine then needs `TM_TOKEN` in the environment Claude Code runs in.

### Without `.mcp.json`

```bash
claude mcp add --transport http task-manager http://localhost:3000/mcp \
  --header "Authorization: Bearer tm_..." --header "X-TM-Project: my-site" -s local
```

`-s local` stores it in your user config for this folder only.

### Checking the endpoint by hand

```bash
curl -s http://localhost:3000/mcp \
  -H 'Authorization: Bearer tm_...' -H 'X-TM-Project: my-site' \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Without the `Accept` header the server answers `406`. A 2025-style request like this one comes back as an SSE frame
(`event: message` / `data: {...}`).

/mcp, `/api/connect/check`, `/api/public/**` and `/auth/**` are rate limited per IP (in memory, per server instance;
`429` with `Retry-After`). The MCP budget (bursts of 120, 600 requests/minute) is far above what a Claude session
uses.

## Tools

All tools return compact JSON text (null and empty fields are dropped); the main ones also return it as
`structuredContent`. Common parameters:

- `ref`: task key (`DEMO-12`, case-insensitive) or task id.
- `project`: project slug (`my-site`); the project key (`DEMO`) is accepted too. When omitted the fallback depends
  on the tool (see the **Default** column): the session default project from `X-TM-Project`, then:

| Default when `project` is omitted and the session has no default project | Tools |
|---|---|
| every project (`"all"`) | `list_tasks`, `search_tasks` |
| the Inbox | `create_task` |
| error "No project given..." | `get_project`, `update_project_notes`, `update_project_links`, `list_shared_secrets` |
| the list of projects plus a hint | `get_context` |

An unknown project fails with `Not found: Project "x" not found... Use list_projects to see the valid slugs and keys`.

Assignee values (`assignee` in `create_task` / `update_task`): `"none"`, `"owner"` (the user), `"claude"`,
`{ "external": "<name>" }` for a third party, or `{ "member": "<github login>" }` for a GitHub user invited to the
project who already signed in (anyone else is rejected). Task rows show it as `"owner"`, `"claude"`,
`{ "external": name }` or `{ "member": login }`.

Blocker values (`blocker`): `{ "who": "Client", "what": "DNS access", "since"?: "YYYY-MM-DD" }`; `since` defaults
to today in the owner's time zone (`NUXT_TIMEZONE`, default `Europe/Madrid`). In `update_task` / `set_status`
`null` clears it.

A **task row** (`list_tasks`, `search_tasks`, `get_context`, `update_task`, `set_status`) is
`{ key, title, status, priority, type, size?, executor, assignee?, due?, blocker?, version, checklist? ("done/total"), blockedBy? (open blocker keys) }`.

### Read

| Tool | Input | Returns |
|---|---|---|
| `get_context` | `project?` | `{ session: { token, defaultProject, secretsAllowed }, project: { slug, key, name, status, inbox?, description?, counts, openTasks, links?, notes?, notesTruncated?, notesLength? }, inProgress, nextUp, blocked, inReview }` (task rows). `notes` is the first 3000 characters of the project notes (`notesTruncated`/`notesLength` when longer: read `get_project`). `nextUp` = up to 5 startable `todo` tasks (no open `blockedBy`), executor `ai`/`mixed` first, then priority and due date. In-progress/blocked/in-review lists hold up to 20 rows each. Without any project: `{ session, hint, projects }`. Call it first in every session. |
| `list_projects` | `status?: ProjectStatus[]`, `includeArchived?` (default false) | `{ projects: [{ slug, key, name, status, inbox?, client?, description? (preview), openTasks }] }`, Inbox first |
| `get_project` | `project?` | `{ slug, key, name, status, inbox?, client?, description?, links?: [{ kind, label, url }], notes? (full markdown), counts, openTasks, version, updatedAt, updatedBy }`. Never vault data. |
| `list_tasks` | `project?` (`"all"` = every project), `q?` (text in title, description or key), `status?`, `priority?`, `type?`, `executor?`, `assignee?` (kinds), `dueBefore?` (`YYYY-MM-DD`), `includeClosed?` (default false), `sort?` (`priority` default, `due`, `updated`, `created`, `position`, `key`), `limit?` (default 50, max 200), `offset?` | `{ project, total, offset?, more?, tasks: [row] }`. Closed tasks are hidden unless `includeClosed` or a `status` filter is given. |
| `get_task` | `ref`, `comments?` (`"latest"` default = last 20, `"all"` = up to 200) | `{ key, id, project, title, status, priority, type, size?, executor, assignee?, due?, blocker?, version, description?, checklist?: [{ index, id, text, done }], blockedBy?, blocking?, hiddenDependencies?, comments?: [{ by, at, body }], olderComments?, olderCommentsHint?, createdAt, createdBy, updatedAt, updatedBy, completedAt? }` |
| `search_tasks` | `query`, `project?` (`"all"` = everywhere), `includeClosed?` (default false), `limit?` (default 20, max 50) | `{ tasks: [row] }`, most recently updated first |

### Write

| Tool | Input | Returns / notes |
|---|---|---|
| `create_task` | `project?`, `title`, `description?` (markdown), `status?` (default `todo`), `priority?` (`urgent`, `high`, `medium` default, `low`), `type?` (`feature` default, `bug`, `test`, `idea`, `maintenance`, `docs`), `size?` (`XS`–`XL`), `executor?` (`ai` default, `human`, `mixed`), `assignee?`, `dueDate?`, `blocker?`, `checklist?: string[]` (max 50), `blockedBy?: ref[]` (max 20) | `{ key, version, project, status, url }` |
| `update_task` | `ref`, `expectedVersion`, `patch` (any of `title`, `description`, `status`, `priority`, `type`, `size`, `executor`, `assignee`, `dueDate`, `blocker`; `null` clears `size`, `dueDate`, `blocker`) | Task row. Conflict error when `expectedVersion` is stale. |
| `set_status` | `ref`, `status`, `expectedVersion?`, `note?`, `blocker?` | Task row. `note` is stored as a **new comment on every call** (not idempotent). The blocker is kept until cleared: pass `blocker: null` when the wait is over. Entering `done` sets `completedAt`. |
| `add_checklist_items` | `ref`, `items: string[]` (1–50) | `{ ref, checklist: [{ index, id, text, done }] }` (full list). Does not bump the task version. |
| `toggle_checklist_item` | `ref`, `itemId?` or `index?` (1-based), `done` | `{ ref, item: { id, text, done } }`. Idempotent. |
| `add_comment` | `ref`, `body` (markdown) | `{ ref, commentId, createdAt }`. Use it for progress summaries: files touched, commits, decisions. |
| `link_tasks` | `ref`, `blockedBy` (a ref or a list of refs, max 20) | `{ key, version, blockedBy: [{ key, title, status }], blocking? }`. "`blockedBy` blocks `ref`". Works across projects; self links and cycles are rejected; existing links are kept (idempotent). |
| `unlink_tasks` | `ref`, `blockedBy` (a ref or a list of refs) | Same as `link_tasks`. Removes dependencies: the only tool that removes data (`destructiveHint: true`). |
| `create_project` | `name`, `key` (2–6 chars `A-Z0-9`, immutable), `slug?` (`inbox` and `all` are reserved), `status?` (default `idea`), `description?`, `client?`, `notes?`, `links?: [{ kind?, label, url }]` | `{ slug, key, name, status, version, url }` |
| `update_project_notes` | `project?`, `mode` (`append` / `replace`), `content`, `expectedVersion?` (required for `replace`) | `{ slug, version, notesLength }`. `append` never conflicts. |
| `update_project_links` | `project?`, `links: [{ kind?, label, url }]` (1–30) | `{ slug, links }` (full list). Adds links; a link whose URL already exists gets its label/kind updated. Never removes links. |

No tool deletes or archives tasks, projects, comments or vault entries; `unlink_tasks` (dependency links) is the
only removal.

### Secrets

| Tool | Input | Returns |
|---|---|---|
| `list_shared_secrets` | `project?` | `{ accounts: [{ accountId, service, url, username, notes? }] }`: vault entries flagged **share with Claude**, never the secret |
| `get_shared_secret` | `accountId`, `reason` (3–200 chars) | `{ accountId, service, username, url, secret }` preceded by a "do not repeat it" note. The access (time, token, reason, count) is recorded on the entry. |

Both require a token created with **Allow secrets**; `get_shared_secret` additionally requires the entry to be
flagged **share with Claude** (off by default). Everything else in the vault is invisible to MCP.

The server instructions tell Claude to read a secret only when the task needs it and never to repeat it in the chat,
files, commits or comments.

### Errors

Tool errors come back as `isError` results with a text such as `Not found: ...`, `Forbidden: ...` or
`Invalid input: ...`, plus a recovery hint where one exists (unknown task → use `search_tasks`; secrets refused →
the token lacks **Allow secrets**). Version conflicts return `Conflict: ...` with the current state (see below).

## Prompts

| Prompt | In Claude Code | What it does |
|---|---|---|
| `next-task` (`project?`) | `/mcp__task-manager__next-task` | Reads the context and project notes, picks the next startable task (or continues the one in progress), moves it to `in_progress` and outlines a plan |
| `wrap-up` (`ref?`) | `/mcp__task-manager__wrap-up` | Syncs status, checklist and blocker, adds a summary comment and appends durable learnings to the project notes |

## Conflicts and `expectedVersion`

Every task (and project) has a `version` that increments on each change of its fields (title, description, status,
priority, type, size, executor, assignee, due date, blocker, position). Checklist changes and comments do not
bump it.

Updates carry the version the caller last read. If someone (you in the web UI, another Claude session) changed
the task in the meantime, the call fails with a **version conflict** and the error contains the current task.
The expected recovery, which the server instructions ask Claude to follow, is:

1. read the current task from the error (or `get_task`);
2. merge the intended change with what changed;
3. retry with the new `version`.

`set_status` without `expectedVersion` writes only the status and blocker (last write wins). `append` in
`update_project_notes` and `update_project_links` never conflict.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/mcp` shows the server as **needs authentication** (and "Authenticate" fails with an OAuth/discovery error), or `401 Unauthorized` | The API token was revoked, expired or mistyped (there is no OAuth). Create a new one in **Settings → API tokens** and run `pnpm connect` again. With `--env-token`, check that `TM_TOKEN` is set where Claude Code runs. |
| `400 invalid_project` | `X-TM-Project` in `.mcp.json` is not a valid slug (lowercase letters, numbers, dashes). Fix it or rerun `pnpm connect`. |
| `Project "x" not found` | The slug in `X-TM-Project` does not exist (or was renamed). Create the project in the web app or fix the slug. |
| `429 Too Many Requests` | Rate limit hit; wait for `Retry-After` seconds. |
| `/mcp` shows the server as failed | Is the app running at that URL? Open `<base-url>/api/connect/check` in a browser: a `401` JSON reply means the server is up. |
| Claude Code does not offer the server | Project servers from `.mcp.json` must be approved once; run `/mcp`, or reset choices with `claude mcp reset-project-choices`. |
| Secrets are "forbidden" | Use a token with **Allow secrets** and flag the vault entry **share with Claude**. |
| Conflict errors in a loop | Something keeps editing the same task; re-read it with `get_task` before retrying. |

### Windows notes

- Paths with backslashes work: `pnpm connect C:\Work\PROJECTS\my-site my-site`.
- The token prompt needs an interactive terminal (Windows Terminal, PowerShell). In non-interactive shells set the
  variable first: `$env:TM_TOKEN = 'tm_...'` (PowerShell) or `set TM_TOKEN=tm_...` (cmd).
- For `--env-token`, store `TM_TOKEN` as a *user* environment variable (System Properties → Environment Variables)
  and restart the terminal / editor so Claude Code inherits it.
- `pnpm connect` keeps CRLF line endings if your `.mcp.json` or `.gitignore` already use them.
