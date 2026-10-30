# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Installable desktop app: a web app manifest (`public/manifest.webmanifest`) with 192/512 and maskable icons, so
  Edge or Chrome can install Task Manager and pin it to the Windows taskbar with its own window and icon (no
  service worker). The `theme-color` now follows the light/dark top bar.

## [0.1.0] - 2026-10-30

First public release.

### Added

- **Projects** with status, client, color, links, markdown notes and a permanent Inbox project.
- **Tasks** with per-project keys (`ABC-12`), status, priority, type, size, executor (AI / human / mixed),
  assignee, due date, third-party blockers, checklist, comments and cross-project "blocked by" dependencies
  with cycle detection.
- Optimistic locking on task updates (`expectedVersion`, HTTP 409 with the current task on conflict).
- **Web UI** (Nuxt 4): global and per-project views, filterable and sortable table, kanban board with drag & drop,
  task drawer, project overview, settings, Spanish and English, dark mode, keyboard shortcuts and auto refresh.
- **MCP server** at `/mcp` (stateless Streamable HTTP, bearer tokens) with 19 tools and the `next-task` and
  `wrap-up` prompts; default project from the `X-TM-Project` header.
- **REST API** behind GitHub OAuth, with an owner login gate, CSRF Origin check, security headers and per-IP
  rate limits.
- **Sharing**: invite GitHub users as viewers or commenters, and revocable read-only public links.
- **Encrypted vault** per project (AES-256-GCM) with logged reveals and opt-in secrets shared with Claude
  through tokens with `allowSecrets`.
- **API tokens** stored as SHA-256 hashes, with optional expiry and revocation.
- Scripts: `pnpm run setup` first-run wizard, `pnpm connect` to write a folder's `.mcp.json`, `pnpm db:migrate`,
  `pnpm db:seed [--demo]` and `pnpm gen:keys`.
- Always-on local Windows service (`pnpm service:*`): logon task, supervisor with automatic restart, logs.
- Deploy guide for Turso with Netlify or Vercel, and a full MCP reference.

[Unreleased]: https://github.com/akaneghro/task-manager/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/akaneghro/task-manager/releases/tag/v0.1.0
