// Dev-only owner login without GitHub. Requires `pnpm dev` (import.meta.dev) AND NUXT_DEV_LOGIN=true.
// In production builds `import.meta.dev` is statically false, so this handler always answers 404.
// The owner row it creates carries the placeholder github id 0 (unpinned): the first real GitHub login of
// NUXT_OWNER_GITHUB_LOGIN adopts that row (see resolveGithubLogin), so the owner is never locked out.

import { users } from '../../db/schema'
import { UNPINNED_OWNER_GITHUB_ID, findOwnerUser } from '../../services/users'

function devLoginEnabled(value: unknown): boolean {
  return value === true || value === 'true'
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!import.meta.dev || !devLoginEnabled(config.devLogin)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const db = useDb()
  let owner = await findOwnerUser(db)
  if (!owner) {
    if (!String(config.databaseUrl ?? '').startsWith('file:')) {
      console.warn('[auth] Dev login is creating the owner row in a non-local database (placeholder github id 0; '
        + 'the first GitHub login of NUXT_OWNER_GITHUB_LOGIN will adopt it)')
    }
    const login = String(config.ownerGithubLogin ?? '').trim() || 'dev-owner'
    const [inserted] = await db.insert(users).values({
      githubId: UNPINNED_OWNER_GITHUB_ID,
      githubLogin: login,
      name: login,
      role: 'owner',
      lastLoginAt: new Date(),
    }).returning()
    if (!inserted) throw createError({ statusCode: 500, statusMessage: 'Could not create the dev owner' })
    owner = inserted
  }

  await startUserSession(event, owner)
  return sendRedirect(event, '/tasks')
})
