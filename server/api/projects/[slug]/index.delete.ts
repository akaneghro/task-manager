import { deleteProject } from '../../../services/projects'

export default defineSessionHandler(async (event, ctx) => {
  await deleteProject(ctx, routeParam(event, 'slug'))
  return { ok: true as const }
})
