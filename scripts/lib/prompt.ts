// Terminal prompts for the interactive scripts (connect, setup). Callers check `canPrompt()` first.

import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

/** True when stdin is a terminal we can ask questions on. */
export function canPrompt(): boolean {
  return process.stdin.isTTY === true
}

async function question(text: string, hidden: boolean): Promise<string> {
  let muted = false
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      if (!muted) process.stdout.write(chunk)
      callback()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  // Ctrl+C while asking: exit instead of leaving the process waiting on a paused stdin.
  rl.on('SIGINT', () => {
    rl.close()
    process.stdout.write('\n')
    process.exit(130)
  })
  try {
    if (!hidden) return (await rl.question(text)).trim()
    process.stdout.write(text)
    muted = true
    return (await rl.question('')).trim()
  }
  finally {
    rl.close()
    if (hidden) process.stdout.write('\n')
  }
}

/** Reads a line (trimmed). */
export function ask(text: string): Promise<string> {
  return question(text, false)
}

/** Reads a line (trimmed) without echoing it. */
export function askHidden(text: string): Promise<string> {
  return question(text, true)
}
