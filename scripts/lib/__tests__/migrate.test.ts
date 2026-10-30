import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../migrate'

describe('migrateDatabase', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      }
      catch {
        // Windows may keep the file locked for a moment; temp dirs are cleaned by the OS anyway.
      }
    }
  })

  it('creates the folder, applies the migrations and the Inbox, and is idempotent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm-migrate-'))
    dirs.push(dir)
    const file = join(dir, 'nested', 'task-manager.db')
    const config = { url: `file:${file.replace(/\\/g, '/')}` }

    const first = await migrateDatabase(config)
    expect(existsSync(file)).toBe(true)
    expect(first.applied).toBeGreaterThan(0)
    expect(first.inbox).toEqual({ name: expect.any(String), key: 'INBOX', slug: 'inbox' })

    expect(await migrateDatabase(config)).toEqual(first)
  })
})
