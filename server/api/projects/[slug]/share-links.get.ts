import { listShareLinks } from '../../../services/shareLinks'

export default defineSessionHandler((event, ctx) => listShareLinks(ctx, routeParam(event, 'slug')))
