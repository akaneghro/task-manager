import { getProject } from '../../../services/projects'

export default defineSessionHandler((event, ctx) => getProject(ctx, routeParam(event, 'slug')))
