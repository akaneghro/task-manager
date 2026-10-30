import { deleteComment } from '../../services/comments'

export default defineSessionHandler(async (event, ctx) => {
  await deleteComment(ctx, routeParam(event, 'id'))
  return { ok: true as const }
})
