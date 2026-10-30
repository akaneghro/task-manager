// GitHub OAuth login + gate: the configured owner, or users with an active project invitation.

import { resolveGithubLogin } from '../../services/users'

export default defineOAuthGitHubEventHandler({
  config: { emailRequired: false },
  async onSuccess(event, { user }) {
    const config = useRuntimeConfig(event)
    // Numeric-looking values are parsed as numbers by the runtime config, hence String().
    const ownerLogin = String(config.ownerGithubLogin ?? '').trim()
    if (!ownerLogin) {
      console.error('[auth] Login refused: NUXT_OWNER_GITHUB_LOGIN is not configured')
      return sendRedirect(event, '/login?error=not_configured')
    }

    const row = await resolveGithubLogin(
      useDb(),
      {
        id: user.id,
        login: user.login,
        name: user.name || null,
        avatarUrl: user.avatar_url || null,
        email: user.email ?? null,
      },
      { login: ownerLogin, githubId: String(config.ownerGithubId ?? '').trim() || undefined },
    )
    if (!row) return sendRedirect(event, '/login?error=not_invited')

    await startUserSession(event, row)
    return sendRedirect(event, '/tasks')
  },
  onError(event, error) {
    console.error(`[auth] GitHub OAuth error: ${error.message}`)
    return sendRedirect(event, '/login?error=oauth')
  },
})
