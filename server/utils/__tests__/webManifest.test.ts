// The web app manifest (public/manifest.webmanifest) makes the app installable from Edge/Chrome (pin to the
// taskbar). Guard its shape, its icon files and that no server middleware gets in the way of fetching them.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { needsCsrfCheck } from '../http'
import { rateLimitRuleFor } from '../rateLimit'
import { securityHeadersFor } from '../securityHeaders'

const publicDir = fileURLToPath(new URL('../../../public/', import.meta.url))

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

interface WebManifest {
  id: string
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
}

function readManifest(): WebManifest {
  return JSON.parse(readFileSync(`${publicDir}manifest.webmanifest`, 'utf8')) as WebManifest
}

/** Width and height from a PNG's IHDR chunk (right after the 8-byte signature). */
function pngSize(file: string): { width: number, height: number } {
  const buf = readFileSync(file)
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('web app manifest', () => {
  it('declares an installable standalone app', () => {
    const manifest = readManifest()
    expect(manifest.name).toBe('Task Manager')
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.id).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true)
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('references icon files that exist with the declared sizes', () => {
    const { icons } = readManifest()
    for (const icon of icons) {
      expect(icon.src.startsWith('/')).toBe(true)
      const file = `${publicDir}${icon.src.slice(1)}`
      expect(existsSync(file), icon.src).toBe(true)
      if (icon.type === 'image/png') {
        const { width, height } = pngSize(file)
        expect(`${width}x${height}`, icon.src).toBe(icon.sizes)
      }
      else {
        expect(icon.type).toBe('image/svg+xml')
        expect(icon.sizes).toBe('any')
      }
    }
  })

  it('has the PNG sizes and purposes browsers need to install it', () => {
    const { icons } = readManifest()
    const png = (sizes: string, purpose: string) =>
      icons.some(i => i.type === 'image/png' && i.sizes === sizes && (i.purpose ?? 'any').split(' ').includes(purpose))
    expect(png('192x192', 'any')).toBe(true)
    expect(png('512x512', 'any')).toBe(true)
    expect(png('512x512', 'maskable')).toBe(true)
  })

  it('is not blocked by rate limiting, CSRF or the CSP', () => {
    const { icons } = readManifest()
    for (const path of ['/manifest.webmanifest', ...icons.map(i => i.src)]) {
      expect(rateLimitRuleFor(path), path).toBeNull()
      expect(needsCsrfCheck('GET', path), path).toBe(false)
      const csp = securityHeadersFor(path, { https: true, dev: false })['Content-Security-Policy'] ?? ''
      // No default-src / manifest-src / img-src restriction that would stop the browser loading them.
      expect(csp).not.toMatch(/(default|manifest|img)-src/)
    }
  })
})
