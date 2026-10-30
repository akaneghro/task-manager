import { updateProject } from '../../../services/projects'
import { updateProjectSchema } from '../../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => {
  const slug = routeParam(event, 'slug')
  return updateProject(ctx, slug, await readBodyAs(event, updateProjectSchema))
})
