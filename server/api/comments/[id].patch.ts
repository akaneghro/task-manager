import { updateComment } from '../../services/comments'
import { commentBodySchema } from '../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const id = routeParam(event, 'id')
  const { body } = await readBodyAs(event, commentBodySchema)
  return updateComment(ctx, id, body)
})
