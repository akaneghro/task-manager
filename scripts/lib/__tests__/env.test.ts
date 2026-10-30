import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DATABASE_URL, databaseConfigFromEnv, describeDatabaseUrl, loadProjectEnv, localDatabasePath, projectRoot } from '../env'

describe('databaseConfigFromEnv', () => {
  it('uses the default local file', () => {
    expect(databaseConfigFromEnv({})).toEqual({ url: DEFAULT_DATABASE_URL })
    expect(databaseConfigFromEnv({ NUXT_DATABASE_URL: '  ', NUXT_DATABASE_AUTH_TOKEN: '' })).toEqual({ url: DEFAULT_DATABASE_URL })
  })

  it('reads url and auth token', () => {
    expect(databaseConfigFromEnv({ NUXT_DATABASE_URL: 'libsql://db.turso.io', NUXT_DATABASE_AUTH_TOKEN: 'secret' }))
      .toEqual({ url: 'libsql://db.turso.io', authToken: 'secret' })
  })
})

describe('localDatabasePath', () => {
  const cwd = resolve(tmpdir(), 'tm-cwd')

  it('resolves relative file URLs against cwd', () => {
    expect(localDatabasePath('file:./data/task-manager.db', cwd)).toBe(resolve(cwd, 'data/task-manager.db'))
    expect(localDatabasePath('file:data/x.db', cwd)).toBe(resolve(cwd, 'data/x.db'))
  })

  it('handles absolute paths and file:// URLs', () => {
    const abs = resolve(tmpdir(), 'abs.db')
    expect(localDatabasePath(pathToFileURL(abs).href, cwd)).toBe(abs)
  })

  it('returns null for remote and in-memory databases', () => {
    expect(localDatabasePath('libsql://db.turso.io', cwd)).toBeNull()
    expect(localDatabasePath('https://db.turso.io', cwd)).toBeNull()
    expect(localDatabasePath(':memory:', cwd)).toBeNull()
    expect(localDatabasePath('file::memory:', cwd)).toBeNull()
  })
})

describe('describeDatabaseUrl', () => {
  it('drops query strings and credentials from remote URLs', () => {
    expect(describeDatabaseUrl('libsql://user:pw@db.turso.io?authToken=x')).toBe('libsql://db.turso.io')
    expect(describeDatabaseUrl('file:./data/task-manager.db')).toBe('file:./data/task-manager.db')
  })
})

describe('loadProjectEnv / projectRoot', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('points at the repository root', () => {
    expect(projectRoot().replace(/[\\/]$/, '')).toBe(resolve(fileURLToPath(new URL('../../..', import.meta.url))))
  })

  it('returns false when there is no env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm-env-'))
    dirs.push(dir)
    expect(loadProjectEnv(dir)).toBe(false)
  })
})
