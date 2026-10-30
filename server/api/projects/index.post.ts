import { createProject } from '../../services/projects'
import { createProjectSchema } from '../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => createProject(ctx, await readBodyAs(event, createProjectSchema)))
