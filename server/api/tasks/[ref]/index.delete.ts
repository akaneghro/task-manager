import { deleteTask } from '../../../services/tasks'

export default defineSessionHandler(async (event, ctx) => {
  await deleteTask(ctx, routeParam(event, 'ref'))
  return { ok: true as const }
})
