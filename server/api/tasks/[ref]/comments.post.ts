import { addComment } from '../../../services/comments'
import { commentBodySchema } from '../../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const ref = routeParam(event, 'ref')
  const { body } = await readBodyAs(event, commentBodySchema)
  return addComment(ctx, ref, body)
})
