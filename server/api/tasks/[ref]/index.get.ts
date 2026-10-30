import { getTask } from '../../../services/tasks'

export default defineSessionHandler((event, ctx) => getTask(ctx, routeParam(event, 'ref')))
