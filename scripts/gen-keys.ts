// Prints fresh secrets for the local environment file. Usage: pnpm gen:keys
// Nothing is written to disk: copy the lines yourself.

import { generateSessionPassword, generateVaultKey } from '../server/utils/crypto'

const lines = [
  '# Paste these lines into your environment file (see .env.example). Do not commit them.',
  `NUXT_SESSION_PASSWORD=${generateSessionPassword()}`,
  `NUXT_VAULT_KEY=${generateVaultKey()}`,
]

console.log(lines.join('\n'))
console.warn([
  '',
  'WARNING: keep NUXT_VAULT_KEY safe (e.g. in your password manager).',
  '  Vault secrets are encrypted with it: if you lose or change it, every stored secret becomes unrecoverable.',
  '  Changing NUXT_SESSION_PASSWORD only logs everybody out.',
].join('\n'))
