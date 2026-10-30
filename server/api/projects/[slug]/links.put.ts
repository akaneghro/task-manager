import { replaceProjectLinks } from '../../../services/projects'
import { replaceProjectLinksSchema } from '../../../../shared/schemas/project'

export default defineSessionHandler(async (event, ctx) => {
  const slug = routeParam(event, 'slug')
  const { links } = await readBodyAs(event, replaceProjectLinksSchema)
  return replaceProjectLinks(ctx, slug, links)
})
