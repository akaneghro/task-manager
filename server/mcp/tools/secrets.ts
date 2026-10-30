// Vault tools for Claude: list_shared_secrets (metadata only) and get_shared_secret (decrypts, logged).
// Only accounts flagged "share with Claude", and only with a token created with "allow secrets".

import { z } from 'zod'
import { getSharedSecret, listSharedSecrets } from '../../services/accounts'
import { jsonResult, runTool } from '../result'
import { READ_ONLY, projectParam, requireProject } from './common'
import type { ToolRegistrar } from './common'

export const registerSecretTools: ToolRegistrar = (server, ctx) => {
  server.registerTool('list_shared_secrets', {
    title: 'List shared secrets',
    description: 'Lists the vault accounts of a project that the user shared with Claude (service, url, username, '
      + 'notes, accountId). Never returns secret values. Only works with a token that allows secrets.',
    inputSchema: z.object({ project: projectParam.optional() }),
    annotations: READ_ONLY,
  }, ({ project }) => runTool(async () => {
    const accounts = await listSharedSecrets(ctx, requireProject(ctx, project))
    return jsonResult({
      accounts: accounts.map(a => ({
        accountId: a.id,
        service: a.service,
        url: a.url,
        username: a.username,
        notes: a.notes || undefined,
      })),
    })
  }))

  server.registerTool('get_shared_secret', {
    title: 'Get shared secret',
    description: 'Returns ONE secret (password, API key...) shared with Claude, only when the current task really '
      + 'needs it. Every access is logged with your reason. Use the value only in the command/request that needs it: '
      + 'never print it in chat, write it to files, commits, task comments or notes, or pass it to other tools.',
    inputSchema: z.object({
      accountId: z.string().uuid().describe('accountId from list_shared_secrets.'),
      reason: z.string().trim().min(3).max(200).describe('Why you need it (task key + purpose); stored in the access log.'),
    }),
    // Not marked read-only on purpose: it records an access and should never be auto-approved silently.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ accountId, reason }) => runTool(async () => {
    const secret = await getSharedSecret(ctx, accountId, reason)
    return jsonResult(secret, {
      note: 'Sensitive: use this value only where needed. Do not repeat it in chat, files, commits, comments or notes.',
    })
  }))
}
