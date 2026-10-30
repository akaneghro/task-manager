// Local always-on service for Windows: builds the app and registers a "TaskManager" scheduled task that starts
// scripts/service-run.mjs (hidden, via `conhost --headless`) at logon. The app listens on 127.0.0.1 only.
//
//   pnpm service:install    build + migrate + register the logon task + start now
//   pnpm service:update     rebuild + migrate + restart (after pulling/changing code)
//   pnpm service:start | service:stop | service:restart | service:status | service:logs
//   pnpm service:uninstall  stop + remove the scheduled task

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadProjectEnv, projectRoot } from './lib/env'

const TASK_NAME = 'TaskManager'
const root = projectRoot()
const pidFile = join(root, 'data', 'service.pid')
const logFile = join(root, 'data', 'logs', 'server.log')

loadProjectEnv(root)
const port = process.env.TM_SERVICE_PORT || '3000'
const url = `http://localhost:${port}`

function fail(message: string): never {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function requireWindows(): void {
  if (process.platform !== 'win32') fail('The service commands only support Windows (Task Scheduler).')
}

/** Runs a PowerShell snippet. Values are passed through environment variables, never interpolated. */
function powershell(script: string, env: Record<string, string> = {}): { ok: boolean, stdout: string, stderr: string } {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
  })
  return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
}

function pnpm(args: string[]): void {
  console.log(`\n› pnpm ${args.join(' ')}`)
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', shell: true })
  if (result.status !== 0) fail(`pnpm ${args.join(' ')} failed`)
}

function taskState(): string | null {
  const r = powershell(`$t = Get-ScheduledTask -TaskName $env:TM_TASK -ErrorAction SilentlyContinue; if ($t) { $t.State.ToString() }`, { TM_TASK: TASK_NAME })
  return r.ok && r.stdout ? r.stdout : null
}

function readPid(): number | null {
  if (!existsSync(pidFile)) return null
  const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

async function isResponding(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(`${url}/login`, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' })
    return res.status < 500
  }
  catch {
    return false
  }
}

async function waitUntilResponding(seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds; i++) {
    if (await isResponding()) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

function register(): void {
  const r = powershell(`
$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless "' + $env:TM_NODE + '" "' + $env:TM_RUNNER + '"') -WorkingDirectory $env:TM_ROOT
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:TM_USER
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:TM_USER -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $env:TM_TASK -Description 'Task Manager local server (http://localhost)' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
`, {
    TM_TASK: TASK_NAME,
    TM_NODE: process.execPath,
    TM_RUNNER: join(root, 'scripts', 'service-run.mjs'),
    TM_ROOT: root,
    TM_USER: `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`,
  })
  if (!r.ok) fail(`Could not register the scheduled task:\n${r.stderr}`)
}

function startTask(): void {
  const r = powershell(`Start-ScheduledTask -TaskName $env:TM_TASK`, { TM_TASK: TASK_NAME })
  if (!r.ok) fail(`Could not start the scheduled task:\n${r.stderr}`)
}

function stopService(): void {
  powershell(`Stop-ScheduledTask -TaskName $env:TM_TASK -ErrorAction SilentlyContinue`, { TM_TASK: TASK_NAME })
  const pid = readPid()
  if (pid && isAlive(pid)) {
    // Kill the supervisor and its server child.
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  }
}

async function ensurePortFree(): Promise<void> {
  if (await isResponding(1000)) {
    fail(`Something is already answering on ${url}. Stop it first (e.g. a "pnpm dev" running on port ${port}).`)
  }
}

async function startAndWait(): Promise<void> {
  startTask()
  process.stdout.write('\nWaiting for the server')
  const ok = await waitUntilResponding(45)
  console.log('')
  if (!ok) fail(`The server did not answer on ${url}. Check the log: ${logFile}`)
  console.log(`✔ Task Manager is running at ${url}`)
}

async function install(): Promise<void> {
  requireWindows()
  stopService()
  await ensurePortFree()
  pnpm(['build'])
  pnpm(['db:migrate'])
  register()
  console.log(`\n✔ Scheduled task "${TASK_NAME}" registered (starts hidden when you log in to Windows).`)
  await startAndWait()
  console.log(`\nLogs: ${logFile}`)
  console.log('After changing or pulling code run: pnpm service:update')
}

async function update(): Promise<void> {
  requireWindows()
  if (!taskState()) fail('The service is not installed. Run: pnpm service:install')
  stopService()
  pnpm(['build'])
  pnpm(['db:migrate'])
  await startAndWait()
}

async function status(): Promise<void> {
  requireWindows()
  const state = taskState()
  const pid = readPid()
  const responding = await isResponding()
  console.log(`Scheduled task : ${state ?? 'not installed'}`)
  console.log(`Supervisor pid : ${pid && isAlive(pid) ? pid : 'not running'}`)
  console.log(`HTTP ${url} : ${responding ? 'responding' : 'not responding'}`)
  console.log(`Log            : ${logFile}`)
}

function logs(): void {
  if (!existsSync(logFile)) fail(`No log yet at ${logFile}`)
  const lines = readFileSync(logFile, 'utf8').split(/\r?\n/)
  console.log(lines.slice(-60).join('\n'))
}

async function main(): Promise<void> {
  const command = process.argv[2]
  switch (command) {
    case 'install':
      return install()
    case 'update':
      return update()
    case 'start':
      requireWindows()
      if (!taskState()) fail('The service is not installed. Run: pnpm service:install')
      await ensurePortFree()
      return startAndWait()
    case 'stop':
      requireWindows()
      stopService()
      console.log('✔ Stopped')
      return
    case 'restart':
      requireWindows()
      stopService()
      await new Promise(resolve => setTimeout(resolve, 1000))
      return startAndWait()
    case 'status':
      return status()
    case 'logs':
      return logs()
    case 'uninstall': {
      requireWindows()
      stopService()
      const r = powershell(`Unregister-ScheduledTask -TaskName $env:TM_TASK -Confirm:$false -ErrorAction SilentlyContinue`, { TM_TASK: TASK_NAME })
      if (!r.ok) fail(r.stderr)
      console.log(`✔ Scheduled task "${TASK_NAME}" removed. The database and logs in data/ are kept.`)
      return
    }
    default:
      console.log('Usage: pnpm service:<install|update|start|stop|restart|status|logs|uninstall>')
      process.exit(command ? 1 : 0)
  }
}

await main()
