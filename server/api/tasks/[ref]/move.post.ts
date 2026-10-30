import { moveTask } from '../../../services/tasks'
import { moveTaskSchema } from '../../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const ref = routeParam(event, 'ref')
  return moveTask(ctx, ref, await readBodyAs(event, moveTaskSchema))
})
