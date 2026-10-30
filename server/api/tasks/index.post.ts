import { createTask } from '../../services/tasks'
import { createTaskSchema } from '../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => createTask(ctx, await readBodyAs(event, createTaskSchema)))
