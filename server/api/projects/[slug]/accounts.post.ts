import { createAccount } from '../../../services/accounts'
import { createAccountSchema } from '../../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => {
  const slug = routeParam(event, 'slug')
  return createAccount(ctx, slug, await readBodyAs(event, createAccountSchema))
})
