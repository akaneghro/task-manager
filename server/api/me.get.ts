import { toUserDto, getUserById } from '../services/users'
import { ServiceError } from '../services/context'
import type { UserDto } from '../../shared/types/dto'

export default defineSessionHandler(async (_event, ctx): Promise<{ user: UserDto }> => {
  const actor = ctx.actor
  if (actor.kind !== 'owner' && actor.kind !== 'member') throw new ServiceError('unauthorized', 'Not signed in')
  const row = await getUserById(ctx.db, actor.userId)
  if (!row) throw new ServiceError('unauthorized', 'User not found')
  return { user: toUserDto(row) }
})
