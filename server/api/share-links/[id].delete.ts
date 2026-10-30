import { revokeShareLink } from '../../services/shareLinks'

export default defineSessionHandler(async (event, ctx) => {
  await revokeShareLink(ctx, routeParam(event, 'id'))
  return { ok: true as const }
})
