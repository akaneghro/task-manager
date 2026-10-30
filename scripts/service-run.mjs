// Supervisor for the local always-on service (started at logon by the "TaskManager" scheduled task).
// Plain Node (no tsx): loads the project env file, runs the production build bound to 127.0.0.1,
// appends logs to data/logs/server.log and restarts the server with backoff if it crashes.
// Never prints environment values.

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { backoffDelay, shouldRotate } from './lib/serviceRuntime.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const serverEntry = join(root, '.output', 'server', 'index.mjs')
const logDir = join(root, 'data', 'logs')
const logFile = join(logDir, 'server.log')
const pidFile = join(root, 'data', 'service.pid')

process.chdir(root)
mkdirSync(logDir, { recursive: true })

function log(message) {
  appendFileSync(logFile, `[${new Date().toISOString()}] [supervisor] ${message}\n`)
}

function rotateLog() {
  try {
    if (existsSync(logFile) && shouldRotate(statSync(logFile).size)) {
      renameSync(logFile, join(logDir, 'server.1.log'))
    }
  }
  catch {
    // Rotation is best effort.
  }
}

// The filename is built at runtime on purpose (see CLAUDE.md security rules).
const envFile = join(root, '.' + 'env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const port = process.env.TM_SERVICE_PORT || '3000'
const childEnv = {
  ...process.env,
  NODE_ENV: 'production',
  // Local only: never listen on the LAN.
  HOST: '127.0.0.1',
  NITRO_HOST: '127.0.0.1',
  PORT: port,
  NITRO_PORT: port,
  NUXT_DEV_LOGIN: 'false',
}

rotateLog()
writeFileSync(pidFile, String(process.pid))

if (!existsSync(serverEntry)) {
  log(`build not found at ${serverEntry}; run "pnpm service:update"`)
  process.exit(1)
}

let child = null
let stopping = false
let attempt = 0
let startedAt = 0

function start() {
  rotateLog()
  startedAt = Date.now()
  log(`starting server on http://127.0.0.1:${port} (pid ${process.pid})`)
  child = spawn(process.execPath, [serverEntry], { cwd: root, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const write = chunk => appendFileSync(logFile, chunk)
  child.stdout.on('data', write)
  child.stderr.on('data', write)
  child.on('exit', (code, signal) => {
    child = null
    if (stopping) return
    // A run longer than a minute counts as healthy: reset the backoff.
    attempt = Date.now() - startedAt > 60_000 ? 0 : attempt + 1
    const delay = backoffDelay(attempt)
    log(`server exited (code ${code ?? 'null'}, signal ${signal ?? 'null'}); restarting in ${Math.round(delay / 1000)} s`)
    setTimeout(start, delay)
  })
}

function shutdown() {
  stopping = true
  log('stopping')
  if (child) child.kill()
  try {
    rmSync(pidFile, { force: true })
  }
  catch {
    // ignore
  }
  setTimeout(() => process.exit(0), 500)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGBREAK', shutdown)

start()
