import { createShareLink } from '../../../services/shareLinks'
import { createShareLinkSchema } from '../../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => {
  const slug = routeParam(event, 'slug')
  return createShareLink(ctx, slug, await readBodyAs(event, createShareLinkSchema))
})
