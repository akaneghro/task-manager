import { listAccounts } from '../../../services/accounts'

export default defineSessionHandler((event, ctx) => listAccounts(ctx, routeParam(event, 'slug')))
