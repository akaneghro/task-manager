import { listComments } from '../../../services/comments'

export default defineSessionHandler((event, ctx) => listComments(ctx, routeParam(event, 'ref')))
