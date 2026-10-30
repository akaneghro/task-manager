import { z } from 'zod'

export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(60).regex(/^[\w .-]+$/, 'Letters, numbers, spaces, dots, dashes and underscores only'),
  /** Allows the token to read vault secrets flagged "share with Claude". */
  allowSecrets: z.boolean().default(false),
  /** Days until expiry; omitted = never expires. */
  expiresInDays: z.number().int().min(1).max(3650).nullish(),
})
export type CreateTokenInput = z.input<typeof createTokenSchema>
