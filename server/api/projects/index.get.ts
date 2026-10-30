import { z } from 'zod'
import { listProjects } from '../../services/projects'
import { queryBoolean, queryEnumList } from '../../../shared/schemas/common'
import { PROJECT_STATUSES } from '../../../shared/utils/enums'

const querySchema = z.object({
  status: queryEnumList(PROJECT_STATUSES).optional(),
  includeArchived: z.preprocess(v => (v === '' ? undefined : v), queryBoolean.optional()),
})

export default defineSessionHandler((event, ctx) => listProjects(ctx, queryAs(event, querySchema)))
