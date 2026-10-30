import { deleteTaskLink } from '../../services/taskLinks'

export default defineSessionHandler(async (event, ctx) => {
  await deleteTaskLink(ctx, routeParam(event, 'id'))
  return { ok: true as const }
})
