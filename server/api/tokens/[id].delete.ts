import { revokeToken } from '../../services/tokens'

export default defineSessionHandler(async (event, ctx) => {
  await revokeToken(ctx, routeParam(event, 'id'))
  return { ok: true as const }
})
