import { revokeMember } from '../../services/members'

export default defineSessionHandler(async (event, ctx) => {
  await revokeMember(ctx, routeParam(event, 'id'))
  return { ok: true as const }
})
