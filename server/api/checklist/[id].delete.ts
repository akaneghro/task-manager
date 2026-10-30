import { deleteChecklistItem } from '../../services/checklist'

export default defineSessionHandler(async (event, ctx) => {
  await deleteChecklistItem(ctx, routeParam(event, 'id'))
  return { ok: true as const }
})
