import { describe, expect, it } from 'vitest'
import { ArgsError, parseArgs, parseConnectArgs, projectSlugFromFolder } from '../args'

describe('parseArgs', () => {
  const spec = { boolean: ['demo', 'force'], string: ['url'], alias: { h: 'help', f: 'force' } }

  it('separates positionals, booleans and string flags', () => {
    expect(parseArgs(['a', '--demo', 'b', '--url', 'http://x'], spec)).toEqual({
      positionals: ['a', 'b'],
      booleans: { demo: true, force: false },
      strings: { url: 'http://x' },
    })
  })

  it('supports --flag=value, --bool=false and short aliases', () => {
    const parsed = parseArgs(['--url=http://x:1/a=b', '--demo=false', '-f'], spec)
    expect(parsed.strings.url).toBe('http://x:1/a=b')
    expect(parsed.booleans).toEqual({ demo: false, force: true })
  })

  it('treats everything after -- as positionals', () => {
    expect(parseArgs(['--', '--demo', '-x'], spec).positionals).toEqual(['--demo', '-x'])
  })

  it('keeps a lone dash and negative-looking values as positionals', () => {
    expect(parseArgs(['-'], spec).positionals).toEqual(['-'])
  })

  it('throws on unknown flags, missing or repeated values', () => {
    expect(() => parseArgs(['--nope'], spec)).toThrow(ArgsError)
    expect(() => parseArgs(['-z'], spec)).toThrow(ArgsError)
    expect(() => parseArgs(['--url'], spec)).toThrow(/requires a value/)
    expect(() => parseArgs(['--url', '--demo'], spec)).toThrow(/requires a value/)
    expect(() => parseArgs(['--url='], spec)).toThrow(/non-empty/)
    expect(() => parseArgs(['--url', 'a', '--url', 'b'], spec)).toThrow(/more than once/)
    expect(() => parseArgs(['--demo=yes'], spec)).toThrow(/does not take a value/)
  })
})

describe('parseConnectArgs', () => {
  it('parses defaults', () => {
    expect(parseConnectArgs(['C:\\Work\\repo', 'Demo-Web'])).toEqual({
      repoPath: 'C:\\Work\\repo',
      projectSlug: 'demo-web',
      slugFromFolder: false,
      url: undefined,
      name: 'task-manager',
      envToken: false,
      dryRun: false,
      force: false,
      help: false,
    })
  })

  it('parses every option', () => {
    const options = parseConnectArgs(['../repo', 'abc', '--url', 'https://tm.example.com/', '--name', 'tm_2', '--env-token', '--dry-run', '--force'])
    expect(options).toMatchObject({ url: 'https://tm.example.com/', name: 'tm_2', envToken: true, dryRun: true, force: true })
  })

  it('allows --help without positionals', () => {
    expect(parseConnectArgs(['-h']).help).toBe(true)
    expect(parseConnectArgs(['--help']).help).toBe(true)
  })

  it('derives the project slug from the folder name when omitted', () => {
    expect(parseConnectArgs(['/work/projects/Acme Web'])).toMatchObject({ projectSlug: 'acme-web', slugFromFolder: true })
    expect(parseConnectArgs(['C:/Work/projects/acme/'])).toMatchObject({ projectSlug: 'acme', slugFromFolder: true })
    expect(parseConnectArgs(['C:/Work/projects/acme', 'ACM-site'])).toMatchObject({ projectSlug: 'acm-site', slugFromFolder: false })
    expect(projectSlugFromFolder('/work/clients/Café Ñandú/')).toBe('cafe-nandu')
    expect(() => parseConnectArgs(['C:/Work/___'])).toThrow(/Could not derive/)
  })

  // Backslashes only separate folders on Windows (CI also runs on Linux).
  it.runIf(process.platform === 'win32')('derives the slug from Windows paths with backslashes', () => {
    expect(parseConnectArgs(['C:\\Work\\projects\\Acme Web'])).toMatchObject({ projectSlug: 'acme-web', slugFromFolder: true })
    expect(projectSlugFromFolder('D:\\Clients\\Café Ñandú\\')).toBe('cafe-nandu')
  })

  it('validates positionals and the server name', () => {
    expect(() => parseConnectArgs([])).toThrow(/Missing argument/)
    expect(() => parseConnectArgs(['repo', 'slug', 'extra'])).toThrow(/Unexpected/)
    expect(() => parseConnectArgs(['repo', 'slug', '--name', 'bad name'])).toThrow(/--name/)
  })
})
