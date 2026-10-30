import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../../server/services/__tests__/helpers'
import { countTasksByStatus } from '../../../server/services/lookup'
import { decryptSecret, encryptSecret } from '../../../server/utils/crypto'

describe('foundation smoke', () => {
  it('migrates a temp db and round-trips crypto', async () => {
    const t = await createTestDb()
    const counts = await countTasksByStatus(t.db, ['x'])
    expect(counts.get('x')?.todo).toBe(0)
    const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    const enc = await encryptSecret('s3cret', key, 'row-1')
    expect(await decryptSecret(enc, key, 'row-1')).toBe('s3cret')
    await expect(decryptSecret(enc, key, 'row-2')).rejects.toThrow()
    t.cleanup()
  })
})
