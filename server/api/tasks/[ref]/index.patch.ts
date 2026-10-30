import { updateTask } from '../../../services/tasks'
import { updateTaskSchema } from '../../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const ref = routeParam(event, 'ref')
  return updateTask(ctx, ref, await readBodyAs(event, updateTaskSchema))
})
