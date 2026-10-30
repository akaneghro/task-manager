import { listTasks } from '../../services/tasks'
import { listTasksQuerySchema } from '../../../shared/schemas/task'

export default defineSessionHandler((event, ctx) => listTasks(ctx, queryAs(event, listTasksQuerySchema)))
