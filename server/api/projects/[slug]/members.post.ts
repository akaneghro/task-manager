import { inviteMember } from '../../../services/members'
import { inviteMemberSchema } from '../../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => {
  const slug = routeParam(event, 'slug')
  return inviteMember(ctx, slug, await readBodyAs(event, inviteMemberSchema))
})
