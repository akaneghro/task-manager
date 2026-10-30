# Deploying Task Manager

Task Manager runs anywhere Nuxt/Nitro runs. The recommended free setup is:

- **Database:** [Turso](https://turso.tech) (hosted libSQL / SQLite)
- **Hosting:** [Netlify](https://www.netlify.com) or [Vercel](https://vercel.com) (no provider-specific APIs are used,
  so you can switch later)

Validate everything locally first (see the README quick start), then follow these steps.

## 1. Create the Turso database

Everything can be done in the web dashboard, so you do not need the Turso CLI (which needs WSL on Windows).

1. Sign up at <https://app.turso.tech> and create a **database** (pick the region closest to your hosting region).
2. Copy its URL: `libsql://<database>-<organization>.turso.io`.
3. Create a **database token** (read & write) and copy it. Treat it like a password.

## 2. Run the migrations against Turso

From the task-manager folder, point the scripts at Turso for this terminal session only.
Variables set in the shell take precedence over your local environment file.

PowerShell:

```powershell
$env:NUXT_DATABASE_URL = 'libsql://<database>-<organization>.turso.io'
$env:NUXT_DATABASE_AUTH_TOKEN = '<turso-token>'
pnpm db:migrate          # creates the tables and the Inbox project
pnpm db:seed --demo      # optional demo data
Remove-Item Env:NUXT_DATABASE_URL, Env:NUXT_DATABASE_AUTH_TOKEN
```

bash:

```bash
NUXT_DATABASE_URL='libsql://<database>-<organization>.turso.io' NUXT_DATABASE_AUTH_TOKEN='<turso-token>' pnpm db:migrate
```

Run `pnpm db:migrate` again after every update that adds a migration (`server/db/migrations/`), **before**
deploying the new code.

## 3. Create the production GitHub OAuth App

Create a separate OAuth App for production at **GitHub → Settings → Developer settings → OAuth Apps**:

| Field | Value |
|---|---|
| Homepage URL | `https://<your-domain>` |
| Authorization callback URL | `https://<your-domain>/auth/github` |

Copy the client id and generate a client secret.

## 4. Environment variables

Set these in the hosting dashboard (Site/Project settings → Environment variables). Generate fresh values for
production with `pnpm gen:keys` — do not reuse your local ones.

| Variable | Required | Value |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | yes | From `pnpm gen:keys` (32+ characters) |
| `NUXT_VAULT_KEY` | yes | From `pnpm gen:keys` (32 bytes, base64). **Back it up.** |
| `NUXT_OAUTH_GITHUB_CLIENT_ID` | yes | Production OAuth App |
| `NUXT_OAUTH_GITHUB_CLIENT_SECRET` | yes | Production OAuth App |
| `NUXT_OWNER_GITHUB_LOGIN` | yes | Your GitHub username (the only owner) |
| `NUXT_OWNER_GITHUB_ID` | no | Your numeric GitHub id, to pin the owner even if the login changes |
| `NUXT_DATABASE_URL` | yes | `libsql://<database>-<organization>.turso.io` |
| `NUXT_DATABASE_AUTH_TOKEN` | yes | Turso database token |
| `NUXT_PUBLIC_SITE_URL` | yes | `https://<your-domain>` (no trailing slash). Used to build public share links. |
| `NUXT_OAUTH_GITHUB_REDIRECT_URL` | no | Only if the callback must differ from `<site>/auth/github` |

Never set `NUXT_DEV_LOGIN` in production (it only works in dev builds anyway). The local `file:` database does
not work on serverless platforms: `NUXT_DATABASE_URL` must point at Turso.

## 5a. Netlify

Netlify's free plan allows commercial use.

1. **Add new site → Import an existing project** and pick the GitHub repository.
2. Build settings: build command `pnpm build`, publish directory `dist` (Netlify detects Nuxt and usually fills
   these in).
3. Add the environment variables above plus `NITRO_PRESET=netlify`.
4. Deploy, then open `https://<site>.netlify.app` (or your custom domain) and log in with GitHub.

## 5b. Vercel

Vercel's **Hobby** plan is limited to personal, **non-commercial** use. If you use Task Manager for client work,
consider the Pro plan or Netlify.

1. **Add New → Project** and import the GitHub repository. Vercel detects Nuxt (preset `vercel`) automatically.
2. Add the environment variables above (Production environment).
3. Deploy, then open `https://<project>.vercel.app` (or your custom domain) and log in with GitHub.

## 6. Connect Claude Code to production

1. Log in to the production site, create an API token in **Settings**.
2. For each repository:

   ```bash
   pnpm connect <path-to-repo> <project-slug> --url https://<your-domain>
   ```

Tokens are per instance: a local token does not work against production and vice versa.

## Rotating keys and secrets

| What | Effect of changing it | How |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | Everybody is logged out | Set a new value, redeploy |
| `NUXT_VAULT_KEY` | **Every stored vault secret becomes unreadable** | There is no automatic re-encryption in v1: reveal and write down each secret, change the key, redeploy, then re-enter the secrets. Losing the key means losing the secrets. |
| GitHub client secret | Login fails until updated | Generate a new secret in the OAuth App, update the variable, redeploy |
| Turso token | The app cannot reach the database until updated | Create a new token, update `NUXT_DATABASE_AUTH_TOKEN`, redeploy, then revoke the old one |
| API tokens (MCP) | The affected Claude Code sessions get `401` | Revoke in **Settings**, create a new one, run `pnpm connect` again |
| Public share links | The old link returns 404 | Revoke and create a new link in the project settings |

## Backups

Check which point-in-time restore window your Turso plan includes. For an extra copy, the Turso CLI (WSL on
Windows) can export a SQL dump: `turso db shell <database> .dump > backup.sql`.
Back up `NUXT_VAULT_KEY` separately (password manager): a database backup without the key cannot decrypt secrets.
