import { z } from 'zod'
import { getLastChange } from '../services/sync'

const querySchema = z.object({
  project: z.string().trim().max(200).optional(),
})

export default defineSessionHandler((event, ctx) => {
  const { project } = queryAs(event, querySchema)
  return getLastChange(ctx, project || undefined)
})
