import { addChecklistItems } from '../../../services/checklist'
import { addChecklistItemsSchema } from '../../../../shared/schemas/task'

export default defineSessionHandler(async (event, ctx) => {
  const ref = routeParam(event, 'ref')
  const { items } = await readBodyAs(event, addChecklistItemsSchema)
  return addChecklistItems(ctx, ref, items)
})
