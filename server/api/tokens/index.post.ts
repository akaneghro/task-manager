import { createToken } from '../../services/tokens'
import { createTokenSchema } from '../../../shared/schemas/token'

export default defineSessionHandler(async (event, ctx) => {
  // The plain token is returned only once: never cache the response.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return createToken(ctx, await readBodyAs(event, createTokenSchema))
})
