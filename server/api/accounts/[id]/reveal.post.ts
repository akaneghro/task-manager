import { revealSecret } from '../../../services/accounts'

export default defineSessionHandler(async (event, ctx) => {
  // Decrypted value: never cache it anywhere.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return revealSecret(ctx, routeParam(event, 'id'))
})
