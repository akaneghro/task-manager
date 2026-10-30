// Dev-only owner login without GitHub. Requires `pnpm dev` (import.meta.dev) AND NUXT_DEV_LOGIN=true.
// In production builds `import.meta.dev` is statically false, so this handler always answers 404.

import { users } from '../../db/schema'
import { findOwnerUser } from '../../services/users'

function devLoginEnabled(value: unknown): boolean {
  return value === true || value === 'true'
}

export default defineEventHandler(async (event) => {
  if (!import.meta.dev || !devLoginEnabled(useRuntimeConfig(event).devLogin)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const db = useDb()
  let owner = await findOwnerUser(db)
  if (!owner) {
    const login = String(useRuntimeConfig(event).ownerGithubLogin ?? '').trim() || 'dev-owner'
    const [inserted] = await db.insert(users).values({
      githubId: 0,
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
