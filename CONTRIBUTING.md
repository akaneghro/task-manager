# Contributing

Thanks for your interest in Task Manager. Bug reports, ideas and pull requests are welcome.

## Setup

You need Node.js 22.18+ and pnpm 10.

```bash
pnpm install
pnpm run setup        # env file, keys, GitHub OAuth App, local database
pnpm db:seed --demo   # optional sample projects
pnpm dev              # http://localhost:3000
```

For local work without GitHub you can set `NUXT_DEV_LOGIN=true` in your env file and log in as the owner at
`/auth/dev` (dev server only).

## Before opening a pull request

```bash
pnpm lint
pnpm typecheck
pnpm test
```

All three must pass (CI runs them on Ubuntu and Windows). Please also:

- add or update tests for new logic (they live next to the code in `__tests__/` folders);
- keep UI strings in i18n files, with Spanish and English in sync;
- update `docs/mcp.md` when an MCP tool or schema changes;
- never use `any` in TypeScript (use `unknown` and narrow it);
- never commit secrets, tokens or real personal data, including in fixtures and screenshots.

[CLAUDE.md](CLAUDE.md) describes the architecture, layering rules and domain rules in detail.

## Branches and commits

- Branch from `main`: `feat/<short-name>` for features, `fix/<short-name>` for fixes, `docs/<short-name>` for docs.
- Use [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`, `ci:`. Keep commits focused.
- Add a line to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).
