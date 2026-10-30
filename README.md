<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="Task Manager logo">
</p>

<h1 align="center">Task Manager</h1>

<p align="center">
  <strong>Self-hosted projects &amp; tasks for freelancers, with an MCP server so Claude Code works on your tasks too.</strong>
</p>

<p align="center">
  <a href="https://github.com/akaneghro/task-manager/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/akaneghro/task-manager/ci.yml?branch=main&label=CI" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.18-339933?logo=node.js&logoColor=white" alt="Node >= 22.18">
  <a href="docs/mcp.md"><img src="https://img.shields.io/badge/MCP-Claude%20Code%20ready-7c3aed" alt="MCP server for Claude Code"></a>
</p>

<p align="center">
  <img src="docs/screenshots/tasks-board.png" alt="Kanban board with tasks from several projects" width="900">
</p>

## Why

When you juggle many client projects, tasks end up scattered across notes, issues and chat history. Task Manager
keeps them in one place with a **global view** of everything, while each **Claude Code** session you open in a
client repo reads that project's context and creates, updates and closes its tasks through MCP. You see what the
AI did, and Claude sees what you decided.

## Features

- **Projects** with status, client, links, markdown notes and an always-present **Inbox** for quick capture
- **Tasks** with keys (`WEB-12`), status, priority, type, size, executor (AI / human / mixed), due date,
  third-party blockers, cross-project dependencies, checklist and comments
- **Table and kanban views** (drag & drop), per project or across all projects
- **MCP server**: 19 tools and 2 prompts for Claude Code, with optimistic locking so nobody overwrites anybody
- **Sharing**: invite GitHub users as viewers or commenters, or share a revocable read-only public link
- **Encrypted vault** per project (AES-256-GCM), with opt-in, logged access for Claude
- Spanish and English UI, dark mode, keyboard shortcuts

## Quick start

**Prerequisites:** [Node.js](https://nodejs.org) 22.18+, [pnpm](https://pnpm.io) 10 and a GitHub account
(login uses a free GitHub OAuth App; the wizard explains how to create it in one minute).

```bash
pnpm install
pnpm run setup   # first-run wizard: keys, GitHub OAuth App, local database
pnpm dev         # http://localhost:3000
```

> Use `pnpm run setup`, with `run`: plain `pnpm setup` is a built-in pnpm command.

Open <http://localhost:3000> and log in with GitHub. Want sample data? `pnpm db:seed --demo`.

<details>
<summary>What the wizard does / manual setup</summary>

`pnpm run setup` creates your local env file from [`.env.example`](.env.example) with a fresh session password and
vault key, guides you through a [GitHub OAuth App](https://github.com/settings/applications/new)
(Homepage URL `http://localhost:3000`, callback URL `http://localhost:3000/auth/github`), asks for its client
id and secret (hidden input) and your GitHub username, then creates the SQLite database (`data/task-manager.db`)
with the Inbox. It never prints secrets and keeps an existing env file unless you choose to overwrite it (a backup
is saved). Non-interactive: `pnpm run setup --client-id <id> --client-secret <secret> --login <you> --yes`.

Manual alternative:

1. Copy `.env.example` to `.env` and paste the output of `pnpm gen:keys` into it.
2. Create the GitHub OAuth App (URLs above) and fill in `NUXT_OAUTH_GITHUB_CLIENT_ID`,
   `NUXT_OAUTH_GITHUB_CLIENT_SECRET` and `NUXT_OWNER_GITHUB_LOGIN` (your GitHub username).
3. Run `pnpm db:migrate` to create the database and the Inbox.

</details>

## Connect Claude Code

1. In the app, open **Settings → API tokens** and create a token (it is shown once).
2. Connect the folder where you open Claude Code (the project slug defaults to the folder name):

   ```bash
   pnpm connect C:\Work\my-site
   ```

   It asks for the token (or reads `TM_TOKEN`), writes `<folder>/.mcp.json` and adds it to that folder's
   `.gitignore`. The project does not need to exist yet.
3. Open Claude Code in that folder, approve the `task-manager` server and ask it to *"use get_context"*.

Options (`--url`, `--env-token`, `--dry-run`...), the manual `.mcp.json`, every tool and a suggested `CLAUDE.md`
snippet are in the **[MCP reference](docs/mcp.md)**.

## More

<details>
<summary><strong>Always-on local service (Windows)</strong></summary>

Run the app in the background at logon instead of `pnpm dev` (Task Scheduler task `TaskManager`, production build
on `127.0.0.1:3000`, restarted if it crashes, logs in `data/logs/server.log`):

```powershell
pnpm service:install     # build + migrate + register the logon task + start now
pnpm service:status      # task state, supervisor pid, HTTP check
pnpm service:update      # after pulling or changing code: rebuild + migrate + restart
pnpm service:restart     # after editing the env file
pnpm service:logs        # last lines of the server log
pnpm service:stop | service:start | service:uninstall
```

The service and `pnpm dev` share port 3000: stop the service before running `pnpm dev`, or set `TM_SERVICE_PORT`
and add that port's callback URL to your GitHub OAuth App.

</details>

<details>
<summary><strong>Deploy</strong></summary>

A free setup with Turso (database) and Netlify or Vercel (hosting) is described step by step in
**[docs/deploy.md](docs/deploy.md)**, including production environment variables, key rotation and backups.

</details>

<details>
<summary><strong>MCP tools</strong></summary>

| Tool | What it does |
|---|---|
| `get_context` | Snapshot of the current project: notes, links, counts, in progress, next up, blocked, in review |
| `list_projects` / `get_project` | List projects / project detail with notes, links and client |
| `list_tasks` / `search_tasks` / `get_task` | Filter, search and read tasks (checklist, dependencies, comments, version) |
| `create_task` / `update_task` / `set_status` | Create and update tasks; updates carry `expectedVersion` (conflict-safe) |
| `add_checklist_items` / `toggle_checklist_item` | Manage checklists |
| `add_comment` | Markdown comment, e.g. a progress summary |
| `link_tasks` / `unlink_tasks` | "Blocked by" dependencies (cycles are rejected) |
| `create_project` / `update_project_notes` / `update_project_links` | Create projects and keep their notes and links current |
| `list_shared_secrets` / `get_shared_secret` | Vault entries explicitly shared with Claude (opt-in token, logged) |

Prompts: `next-task` (pick the next task and start it) and `wrap-up` (sync status, checklist and a summary
comment). Nothing deletes tasks, projects, comments or secrets. Full reference: [docs/mcp.md](docs/mcp.md).

</details>

<details>
<summary><strong>Security model</strong></summary>

| | Owner | Commenter | Viewer | Public link | MCP token |
|---|---|---|---|---|---|
| See projects and tasks | all | invited projects | invited projects | that project's tasks | all |
| Create / edit tasks | yes | no | no | no | yes |
| Comments | read / write | read / write | read | no | read / write |
| Edit project fields, delete, archive | yes | no | no | no | no |
| Vault | yes (reveal logged) | no | no | no | shared secrets only, with `allowSecrets` (logged) |
| Members, share links, tokens | yes | no | no | no | no |

- **Login gate**: only the owner (`NUXT_OWNER_GITHUB_LOGIN`, then pinned by GitHub id) and invited GitHub users.
- **Vault**: AES-256-GCM with `NUXT_VAULT_KEY`, which lives only in the environment. Claude can read a secret only
  when the entry is flagged *share with Claude* (off by default) **and** the token has *Allow secrets*; every
  access is recorded. Losing the key makes the secrets unrecoverable.
- **API tokens** (`tm_...`) are shown once, stored as SHA-256 hashes, can expire and be revoked. `/mcp` is
  bearer-only and never reads cookies.
- **Web**: sealed cookie sessions, Origin check on writes (CSRF), security headers, per-IP rate limits on public
  endpoints, markdown always sanitized.
- **Public links** are random, read-only, revocable and `noindex`; they never expose notes, comments or the vault.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

</details>

<details>
<summary><strong>Scripts</strong></summary>

| Script | Description |
|---|---|
| `pnpm run setup` | First-run wizard: env file, keys, GitHub OAuth App, database |
| `pnpm dev` | Dev server on http://localhost:3000 |
| `pnpm build` / `pnpm preview` | Production build / preview it locally |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm typecheck` | Type-check the app and the scripts |
| `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` | Vitest |
| `pnpm db:generate` | Generate a migration from `server/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to `NUXT_DATABASE_URL` and ensure the Inbox |
| `pnpm db:seed [--demo]` | Ensure the Inbox (and optionally create demo projects) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm gen:keys` | Print a new `NUXT_SESSION_PASSWORD` and `NUXT_VAULT_KEY` |
| `pnpm connect <folder> [slug]` | Write the MCP config of a folder for Claude Code |
| `pnpm service:<install\|update\|start\|stop\|restart\|status\|logs\|uninstall>` | Always-on local service (Windows) |

</details>

<details>
<summary><strong>Project structure</strong></summary>

```
task-manager/
├── app/              # Nuxt app: pages, layouts, components, composables, stores, utils
├── i18n/locales/     # es / en translations
├── server/
│   ├── api/          # REST endpoints (thin: validate -> service -> DTO)
│   ├── db/           # Drizzle schema, client, migrations
│   ├── mcp/          # MCP server: instructions, tools, prompts
│   ├── routes/       # /mcp endpoint, GitHub OAuth
│   ├── services/     # Domain logic shared by REST and MCP (+ tests)
│   └── utils/        # crypto, actor resolution, HTTP helpers
├── shared/           # Enums, zod schemas, permissions, DTO types (server + app)
├── scripts/          # setup, migrate, seed, gen-keys, connect, service (+ tested helpers in lib/)
├── docs/             # MCP reference, deploy guide, screenshots
└── public/           # Logo, favicon
```

</details>

<details>
<summary><strong>Stack</strong></summary>

Nuxt 4 (Vue 3.5, Nitro) and TypeScript strict · Drizzle ORM + libSQL (SQLite locally, Turso in the cloud) ·
`@modelcontextprotocol/server` (stateless Streamable HTTP) + zod 4 · `nuxt-auth-utils` (GitHub OAuth) ·
Tailwind CSS 4, Pinia, `@nuxtjs/i18n`, `vue-draggable-plus` · unified + rehype-sanitize · Vitest, ESLint, pnpm, tsx

</details>

## Screenshots

| Tasks (table) | Task drawer | Project overview |
|---|---|---|
| ![All tasks in table view](docs/screenshots/tasks-table.png) | ![Task drawer with checklist, dependency and comment](docs/screenshots/task-drawer.png) | ![Project overview with notes, counts and links](docs/screenshots/project-overview.png) |

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the checks and the
commit conventions. Changes are listed in the [CHANGELOG](CHANGELOG.md).

## License

[MIT](LICENSE) © Alberto Alonso
