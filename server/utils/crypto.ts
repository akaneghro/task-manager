// Web Crypto only (globalThis.crypto) so it runs on Node, serverless and edge runtimes.
// No Nitro auto-imports here: this module is imported by services, scripts and tests.

const SECRET_VERSION = 'v1'
const IV_BYTES = 12
const KEY_BYTES = 32
export const API_TOKEN_PREFIX = 'tm_'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

export class VaultKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultKeyError'
  }
}

/** Validates and decodes the base64 vault key (32 bytes). */
export function decodeVaultKey(keyBase64: string): Uint8Array<ArrayBuffer> {
  if (!keyBase64) throw new VaultKeyError('NUXT_VAULT_KEY is not set (run `pnpm gen:keys`)')
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = fromBase64(keyBase64.trim())
  }
  catch {
    throw new VaultKeyError('NUXT_VAULT_KEY is not valid base64')
  }
  if (raw.length !== KEY_BYTES) throw new VaultKeyError(`NUXT_VAULT_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length})`)
  return raw
}

const keyCache = new Map<string, Promise<CryptoKey>>()

function importVaultKey(keyBase64: string): Promise<CryptoKey> {
  let key = keyCache.get(keyBase64)
  if (!key) {
    key = crypto.subtle.importKey('raw', decodeVaultKey(keyBase64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    key.catch(() => keyCache.delete(keyBase64))
    keyCache.set(keyBase64, key)
  }
  return key
}

/**
 * Encrypts a secret with AES-256-GCM. `aad` binds the ciphertext to its row (account id),
 * so a ciphertext copied to another row fails to decrypt.
 * Output format: `v1:<iv base64>:<ciphertext+tag base64>`.
 */
export async function encryptSecret(plaintext: string, keyBase64: string, aad: string): Promise<string> {
  const key = await importVaultKey(keyBase64)
  const iv = randomBytes(IV_BYTES)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(plaintext),
  )
  return `${SECRET_VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
}

/** Decrypts a value produced by `encryptSecret`. Throws on a wrong key, wrong AAD or tampered data. */
export async function decryptSecret(encrypted: string, keyBase64: string, aad: string): Promise<string> {
  const [version, ivB64, ctB64, ...rest] = encrypted.split(':')
  if (version !== SECRET_VERSION || !ivB64 || !ctB64 || rest.length > 0) {
    throw new Error('Unsupported secret format')
  }
  const key = await importVaultKey(keyBase64)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64), additionalData: encoder.encode(aad) },
    key,
    fromBase64(ctB64),
  )
  return decoder.decode(plaintext)
}

/** SHA-256 hex digest. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/** New personal API token: `tm_` + 32 random bytes (base64url). */
export function generateApiToken(): string {
  return `${API_TOKEN_PREFIX}${toBase64Url(randomBytes(32))}`
}

/** Public prefix shown in the UI to recognise a token (never enough to use it). */
export function apiTokenPrefix(token: string): string {
  return token.slice(0, API_TOKEN_PREFIX.length + 6)
}

/** Random URL-safe token for public share links. */
export function generateShareToken(): string {
  return toBase64Url(randomBytes(24))
}

/** New random vault key / session password helpers for `pnpm gen:keys`. */
export function generateVaultKey(): string {
  return toBase64(randomBytes(KEY_BYTES))
}

export function generateSessionPassword(): string {
  return toBase64Url(randomBytes(32))
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
