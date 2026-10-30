import { setTaskStatus } from '../../../services/tasks'
import { setStatusSchema } from '../../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const ref = routeParam(event, 'ref')
  return setTaskStatus(ctx, ref, await readBodyAs(event, setStatusSchema))
})
