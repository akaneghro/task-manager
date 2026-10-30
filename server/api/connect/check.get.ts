import { z } from 'zod'
import { authenticateApiToken } from '../../services/tokens'
import { findProjectRowBySlug } from '../../services/lookup'
import { ServiceError } from '../../services/context'

const querySchema = z.object({
  project: z.string().trim().max(200).optional(),
})

/** Used by `pnpm connect`: validates a bearer API token and whether a project slug exists. */
export default defineServiceHandler(async (event): Promise<{ tokenName: string, projectExists: boolean }> => {
  const plain = bearerToken(event)
  const db = useDb()
  const auth = plain ? await authenticateApiToken(db, plain) : null
  if (!auth) {
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer')
    throw new ServiceError('unauthorized', 'Invalid or missing API token')
  }
  const { project } = queryAs(event, querySchema)
  // API tokens see every project, so no visibility filter is needed.
  const projectExists = project ? (await findProjectRowBySlug(db, project)) !== null : false
  return { tokenName: auth.tokenName, projectExists }
})
