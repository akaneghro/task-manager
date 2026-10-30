import { updateChecklistItem } from '../../services/checklist'
import { updateChecklistItemSchema } from '../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const id = routeParam(event, 'id')
  return updateChecklistItem(ctx, id, await readBodyAs(event, updateChecklistItemSchema))
})
