import { listMembers } from '../../../services/members'

export default defineSessionHandler((event, ctx) => listMembers(ctx, routeParam(event, 'slug')))
