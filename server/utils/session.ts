import type { H3Event } from 'h3'
import type { UserRow } from '../db/schema'
import { sessionUserFromRow } from './actor'

/** Starts a fresh session (replacing any previous one, against session fixation) for a signed-in user. */
export async function startUserSession(event: H3Event, row: UserRow): Promise<void> {
  await replaceUserSession(event, {
    user: sessionUserFromRow(row),
    loggedInAt: Date.now(),
  })
}
