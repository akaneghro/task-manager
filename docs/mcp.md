# MCP reference

Task Manager exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so that every Claude Code
session opened in one of your repositories can read and update that project's tasks.

- **Endpoint:** `POST <base-url>/mcp` (for example `http://localhost:3000/mcp`)
- **Transport:** Streamable HTTP, stateless, JSON responses (no SSE session to keep alive)
- **Auth:** personal API token, `Authorization: Bearer tm_...` (cookies are never read on this route)
- **Default project:** `X-TM-Project: <slug>` header (fallback: `?project=<slug>` query parameter)

> The authoritative list of tools and their JSON schemas is what the server returns for `tools/list`.
> This page explains them; field names match the zod schemas in `shared/schemas/`.

## Authentication

1. In the web app open **Settings → API tokens** and create a token. It is shown **once**; copy it.
2. Optional: tick **Allow secrets** if Claude may read vault secrets flagged "share with Claude" (see below).
3. Optional: set an expiry. Tokens can be revoked at any time.

Only the SHA-256 hash of the token is stored. A missing, unknown, revoked or expired token gets
`401 Unauthorized` with a `WWW-Authenticate: Bearer` header.

An MCP token acts on behalf of the owner with a reduced permission set:

| Can | Cannot |
|---|---|
| Read every project, task, checklist, dependency and comment | Delete or archive anything |
| Create and edit tasks, checklists and dependencies | Edit project fields (name, slug, status, client...) |
| Create projects, edit project notes and links | Manage members, share links or tokens |
| Comment | Read vault secrets, except the shared ones with an `allowSecrets` token |

Every write is attributed to `mcp:<token name>` (`created_by`, `updated_by`, comment author).

## Headers

| Header | Required | Meaning |
|---|---|---|
| `Authorization` | yes | `Bearer tm_...` |
| `X-TM-Project` | recommended | Project slug used when a tool call omits `project`. Claude can still work on other projects when you ask it to. |
| `Accept` | sent by clients | `application/json, text/event-stream` (standard Streamable HTTP) |

## Configuring Claude Code

The easiest way is the helper script, run from the task-manager folder:

```bash
pnpm connect <path-to-repo> <project-slug>            # asks for the token (hidden input)
pnpm connect ../my-site my-site --url https://tm.example.com
pnpm connect ../my-site my-site --env-token           # writes "Bearer ${TM_TOKEN}" instead of the token
```

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

## Tools

All tools return JSON text. `ref` = task key (`DEMO-12`, case-insensitive) or task id.
`project` = project slug; when omitted, the default project from `X-TM-Project` is used (then the Inbox).

### Read

| Tool | Input | Returns |
|---|---|---|
| `get_context` | `project?` | Project summary with counts, plus the tasks `in_progress`, the next 5 `todo` by priority, `blocked` and `in_review`. Call it first in every session. |
| `list_projects` | `status?: ProjectStatus[]`, `includeArchived?` | Project summaries (Inbox first) |
| `get_project` | `project?` | Project detail: description, notes (markdown), links, client |
| `list_tasks` | `project?` (`'all'` = every project), `status?`, `priority?`, `type?`, `executor?`, `assignee?`, `dueBefore?` (`YYYY-MM-DD`), `q?`, `includeClosed?` (default false), `sort?` (`priority`, `due`, `updated`, `created`, `position`, `key`), `limit?` (≤ 500), `offset?` | `{ items, total }` |
| `get_task` | `ref` | Task detail: description, checklist, `blockedBy`/`blocking`, comments, `version` |
| `search_tasks` | `query`, `project?`, `includeClosed?`, `limit?` (default 20) | Matching tasks (title, description, key), most recently updated first |

### Write

| Tool | Input | Notes |
|---|---|---|
| `create_task` | `project?`, `title`, `description?` (markdown), `status?` (default `todo`), `priority?` (`urgent`, `high`, `medium`, `low`), `type?` (`feature`, `bug`, `test`, `idea`, `maintenance`, `docs`), `size?` (`XS`–`XL`), `executor?` (`ai`, `human`, `mixed`), `assignee?`, `dueDate?`, `blocker?` (`{ who, what, since? }`), `checklist?: string[]`, `blockedBy?: ref[]` | Returns the new task with its key (`KEY-N`) |
| `update_task` | `ref`, `expectedVersion`, `patch` (any of `title`, `description`, `status`, `priority`, `type`, `size`, `executor`, `assignee`, `dueDate`, `blocker`; `null` clears nullable fields) | Fails with a conflict when `expectedVersion` is stale |
| `set_status` | `ref`, `status`, `expectedVersion?`, `note?`, `blocker?` | `note` is stored as a comment. Use `blocked` + `blocker` when waiting on a third party. Entering `done` sets `completedAt`. |
| `add_checklist_items` | `ref`, `items: string[]` | Appends; returns the full checklist |
| `toggle_checklist_item` | `ref`, `itemId?` or `index?` (1-based), `done` | Idempotent |
| `add_comment` | `ref`, `body` (markdown) | Use it for progress summaries: files touched, commits, decisions |
| `link_tasks` | `ref`, `blockedBy` (ref), `remove?` | "`blockedBy` blocks `ref`". Works across projects; cycles are rejected. |
| `create_project` | `name`, `key` (2–6 chars, `A-Z0-9`), `slug?`, `status?`, `description?`, `notes?`, `client?`, `color?`, `links?` | |
| `update_project_notes` | `project?`, `mode` (`append` / `replace`), `content`, `expectedVersion?` (required for `replace`) | `append` never conflicts |

Assignee: `{ kind: 'none' | 'owner' | 'claude' }`, `{ kind: 'member', userId }` or `{ kind: 'external', name }`.

There are no destructive tools: Claude cannot delete tasks, projects, comments or vault entries.

### Secrets

| Tool | Input | Returns |
|---|---|---|
| `list_shared_secrets` | `project?` | Vault entries flagged **share with Claude** (service, url, username, notes — never the secret) |
| `get_shared_secret` | `accountId`, `reason` | The decrypted secret. The access (time, token, count) is recorded on the entry. |

Both require a token created with **Allow secrets**; `get_shared_secret` additionally requires the entry to be
flagged **share with Claude** (off by default). Everything else in the vault is invisible to MCP.

The server instructions tell Claude to read a secret only when the task needs it and never to repeat it in the chat,
files, commits or comments.

## Prompts

| Prompt | In Claude Code | What it does |
|---|---|---|
| `next-task` | `/mcp__task-manager__next-task` | Picks the next task of the project, moves it to `in_progress` and starts working |
| `wrap-up` | `/mcp__task-manager__wrap-up` | Syncs status and checklist and adds a summary comment for the work done in the session |

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

`set_status` without `expectedVersion` writes only the status (last write wins).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401 Unauthorized` / "invalid token" | The token was revoked, expired or mistyped. Create a new one and run `pnpm connect` again. With `--env-token`, check that `TM_TOKEN` is set where Claude Code runs. |
| `Project "x" not found` | The slug in `X-TM-Project` does not exist (or was renamed). Create the project in the web app or fix the slug. |
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
