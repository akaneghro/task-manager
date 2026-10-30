// Prints fresh secrets for the local environment file. Usage: pnpm gen:keys
// Nothing is written to disk: copy the lines yourself (or let `pnpm run setup` write them).

import { generateEnvSecrets, VAULT_KEY_WARNING } from './lib/setup'

const secrets = generateEnvSecrets()
const lines = [
  '# Paste these lines into your environment file (see .env.example). Do not commit them.',
  `NUXT_SESSION_PASSWORD=${secrets.NUXT_SESSION_PASSWORD}`,
  `NUXT_VAULT_KEY=${secrets.NUXT_VAULT_KEY}`,
]

console.log(lines.join('\n'))
console.warn(`\n${VAULT_KEY_WARNING}`)
