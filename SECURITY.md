# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
[GitHub Security Advisories](https://github.com/akaneghro/task-manager/security/advisories/new).

Include what you found, how to reproduce it and the impact you expect. You should get a first answer within a
week. Once a fix is released, the advisory is published with credit to you, unless you prefer otherwise.

## Supported versions

Only the latest release on `main` receives security fixes.

## Scope

Areas where reports are especially valuable:

- **Vault cryptography**: AES-256-GCM encryption of project secrets, key handling, any path that returns or logs
  decrypted values
- **Authentication and authorization**: GitHub OAuth login gate, sessions, CSRF protection, the permission model
  (owner, commenter, viewer)
- **MCP API tokens**: token storage and validation, the `/mcp` endpoint, access to secrets shared with Claude
- **Public share links**: anything a public link exposes beyond the read-only task list of its project

Out of scope: vulnerabilities that require an already compromised machine or environment file, denial of service
through volume alone, and issues in third-party dependencies without a demonstrated impact on Task Manager
(Dependabot keeps them updated).

## Operating it safely

- Keep your environment file out of version control and back up `NUXT_VAULT_KEY` separately.
- Use a separate GitHub OAuth App and fresh keys for each deployed instance (`pnpm gen:keys`).
- Give MCP tokens an expiry when possible, enable **Allow secrets** only when needed, and revoke unused tokens.
- Keep `.mcp.json` files out of git (`pnpm connect` adds them to `.gitignore`).
