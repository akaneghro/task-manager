// Session shape of nuxt-auth-utils (sealed cookie). Only public profile data: the role is re-checked against
// the `users` table on every API request (server/utils/actor.ts).

declare module '#auth-utils' {
  interface User {
    id: string
    login: string
    name: string | null
    avatarUrl: string | null
    role: 'owner' | 'member'
  }

  interface UserSession {
    /** Epoch milliseconds of the login. */
    loggedInAt?: number
  }
}

export {}
