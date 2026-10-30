import { updateMember } from '../../services/members'
import { updateMemberSchema } from '../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => {
  const id = routeParam(event, 'id')
  return updateMember(ctx, id, await readBodyAs(event, updateMemberSchema))
})
