import { getPublicProject } from '../../../services/shareLinks'

/** Public share link (no session): the project summary and its tasks. */
export default defineServiceHandler(async (event) => {
  const actor = await publicActorFromToken(event, routeParam(event, 'token'))
  return getPublicProject(serviceContext(event, actor))
})
