import { listTokens } from '../../services/tokens'

export default defineSessionHandler((_event, ctx) => listTokens(ctx))
