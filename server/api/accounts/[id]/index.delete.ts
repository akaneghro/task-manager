import { deleteAccount } from '../../../services/accounts'

export default defineSessionHandler(async (event, ctx) => {
  await deleteAccount(ctx, routeParam(event, 'id'))
  return { ok: true as const }
})
