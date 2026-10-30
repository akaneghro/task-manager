import { updateAccount } from '../../../services/accounts'
import { updateAccountSchema } from '../../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => {
  const id = routeParam(event, 'id')
  return updateAccount(ctx, id, await readBodyAs(event, updateAccountSchema))
})
