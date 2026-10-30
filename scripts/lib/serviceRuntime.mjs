// Pure helpers for scripts/service-run.mjs (plain JS so the supervisor runs without tsx).

/** Rotate server.log once it grows beyond this size. */
export const MAX_LOG_BYTES = 5 * 1024 * 1024

/** @param {number} size */
export function shouldRotate(size) {
  return size > MAX_LOG_BYTES
}

/**
 * Restart delay after the `attempt`-th consecutive quick crash (0 = first restart): 1 s, 2 s, 4 s... capped at 60 s.
 * @param {number} attempt
 */
export function backoffDelay(attempt) {
  const safe = Math.max(0, Math.min(attempt, 10))
  return Math.min(60_000, 1000 * 2 ** safe)
}
