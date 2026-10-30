import { addBlockedBy } from '../../../services/taskLinks'
import { linkTasksSchema } from '../../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const ref = routeParam(event, 'ref')
  const { blockedBy } = await readBodyAs(event, linkTasksSchema)
  return addBlockedBy(ctx, ref, blockedBy)
})
