// First-run wizard: creates the local env file from .env.example (fresh secrets + your GitHub OAuth App),
// then migrates the local database and creates the Inbox. Never prints secret values.
// Usage: pnpm run setup [--client-id <id>] [--client-secret <secret>] [--login <username>] [-y] [--force]
// ("pnpm setup" without "run" is pnpm's own command.)

import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ArgsError } from './lib/args'
import { databaseConfigFromEnv, describeDatabaseUrl, loadProjectEnv, projectRoot } from './lib/env'
import { migrateDatabase } from './lib/migrate'
import { ask, askHidden, canPrompt } from './lib/prompt'
import {
  ENV_EXAMPLE_FILE,
  ENV_FILE,
  GITHUB_OAUTH_APP,
  REQUIRED_ENV_KEYS,
  SETUP_USAGE,
  VAULT_KEY_WARNING,
  emptyEnvKeys,
  envBackupName,
  fillEnvTemplate,
  generateEnvSecrets,
  givenEnvValues,
  isGithubLogin,
  isOAuthValue,
  parseSetupArgs,
} from './lib/setup'
import type { SetupOptions } from './lib/setup'

class SetupError extends Error {}

function warn(message: string): void {
  console.warn(`! ${message}`)
}

interface Question {
  given: string | undefined
  text: string
  valid: (value: string) => boolean
  problem: string
  hidden?: boolean
}

/** Flag value, or the answer (asked until valid; empty = fill it in later), or empty with --yes. */
async function answer(question: Question, interactive: boolean): Promise<string> {
  if (question.given !== undefined) return question.given
  if (!interactive) return ''
  for (;;) {
    const value = question.hidden ? await askHidden(question.text) : await ask(question.text)
    const normalized = value.replace(/^@/, '')
    if (normalized === '' || question.valid(normalized)) return normalized
    warn(question.problem)
  }
}

/** Decides what to do with an existing env file: --force overwrites, otherwise ask (default keep). */
async function shouldOverwrite(envPath: string, options: SetupOptions, interactive: boolean): Promise<boolean> {
  if (options.force) return true
  if (!interactive) return false
  console.log([
    `${envPath} already exists.`,
    'Overwriting it generates a new NUXT_VAULT_KEY (vault secrets saved with the old key become unreadable)',
    'and a new NUXT_SESSION_PASSWORD (everybody is logged out). The old file is kept as a backup.',
  ].join('\n'))
  const choice = (await ask('Keep it or overwrite it? [K/o] ')).toLowerCase()
  return choice === 'o' || choice === 'overwrite'
}

/** Writes the env file (backing up an existing one). Returns the keys still empty. */
async function createEnvFile(root: string, envPath: string, options: SetupOptions, interactive: boolean): Promise<string[]> {
  const templatePath = join(root, ENV_EXAMPLE_FILE)
  if (!existsSync(templatePath)) throw new SetupError(`${templatePath} not found: is this a complete Task Manager checkout?`)

  const needsAnswers = options.clientId === undefined || options.clientSecret === undefined || options.login === undefined
  if (needsAnswers && !interactive && !options.yes) {
    throw new SetupError('No terminal to ask questions. Pass --client-id, --client-secret and --login, or --yes to fill them in later.')
  }
  if (needsAnswers && interactive) {
    console.log([
      '',
      'Login uses a GitHub OAuth App (one per instance, free):',
      `  1. Open ${GITHUB_OAUTH_APP.newAppUrl}`,
      '  2. Application name: Task Manager (any name works)',
      `     Homepage URL:               ${GITHUB_OAUTH_APP.homepageUrl}`,
      `     Authorization callback URL: ${GITHUB_OAUTH_APP.callbackUrl}`,
      '  3. Register application, copy the Client ID, then "Generate a new client secret" and copy it too.',
      'Leave an answer empty to fill it in later in the env file.',
      '',
    ].join('\n'))
  }
  const clientId = await answer({
    given: options.clientId,
    text: 'Client ID: ',
    valid: isOAuthValue,
    problem: 'That does not look like a GitHub OAuth client ID (e.g. Ov23li...). Try again or leave it empty.',
  }, interactive)
  const clientSecret = await answer({
    given: options.clientSecret,
    text: 'Client secret (input hidden): ',
    valid: isOAuthValue,
    problem: 'That does not look like a GitHub OAuth client secret. Try again or leave it empty.',
    hidden: true,
  }, interactive)
  const login = await answer({
    given: options.login,
    text: 'Your GitHub username (the owner of this instance): ',
    valid: isGithubLogin,
    problem: 'That is not a valid GitHub username. Try again or leave it empty.',
  }, interactive)

  // Always written (empty when skipped): the owner must never be inherited from the example file.
  const values: Record<string, string> = {
    ...generateEnvSecrets(),
    NUXT_OAUTH_GITHUB_CLIENT_ID: clientId,
    NUXT_OAUTH_GITHUB_CLIENT_SECRET: clientSecret,
    NUXT_OWNER_GITHUB_LOGIN: login,
  }
  const filled = fillEnvTemplate(readFileSync(templatePath, 'utf8'), values)
  // Neither is the optional owner id: cleared when the example has it, not added when it does not.
  const { text } = fillEnvTemplate(filled.text, { NUXT_OWNER_GITHUB_ID: '' }, { append: false })
  const { appended } = filled

  if (existsSync(envPath)) {
    const backup = envBackupName(new Date(), name => existsSync(join(dirname(envPath), name)))
    renameSync(envPath, join(dirname(envPath), backup))
    console.log(`Previous env file saved as ${backup} (it holds the old NUXT_VAULT_KEY).`)
  }
  writeFileSync(envPath, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 })

  console.log(`\nCreated ${envPath} from ${ENV_EXAMPLE_FILE}:`)
  console.log('  NUXT_SESSION_PASSWORD, NUXT_VAULT_KEY: generated')
  for (const key of ['NUXT_OAUTH_GITHUB_CLIENT_ID', 'NUXT_OAUTH_GITHUB_CLIENT_SECRET', 'NUXT_OWNER_GITHUB_LOGIN']) {
    console.log(`  ${key}: ${values[key] ? 'set' : 'empty'}`)
  }
  if (appended.length > 0) console.log(`  Added (not in ${ENV_EXAMPLE_FILE}): ${appended.join(', ')}`)
  console.warn(`\n${VAULT_KEY_WARNING}`)
  return emptyEnvKeys(text, REQUIRED_ENV_KEYS)
}

/** Keeps an existing env file (secrets untouched), writing only the values given as flags. Returns the keys still empty. */
function keepEnvFile(envPath: string, options: SetupOptions): string[] {
  let text = readFileSync(envPath, 'utf8')
  const given = givenEnvValues(options)
  const keys = Object.keys(given)
  if (keys.length === 0) {
    console.log(`Keeping ${envPath} as it is (--force recreates it).`)
  }
  else {
    text = fillEnvTemplate(text, given).text
    writeFileSync(envPath, text, 'utf8')
    console.log(`Keeping ${envPath} (--force recreates it) and setting ${keys.join(', ')} from the flags.`)
  }
  return emptyEnvKeys(text, REQUIRED_ENV_KEYS)
}

async function run(options: SetupOptions): Promise<void> {
  const root = projectRoot()
  const dir = options.dir ? resolve(options.dir) : root
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new SetupError(`Not a directory: ${dir}`)
  const interactive = canPrompt() && !options.yes
  const envPath = join(dir, ENV_FILE)

  console.log('Task Manager setup')

  // 1) Env file
  let empty: string[]
  if (existsSync(envPath) && !await shouldOverwrite(envPath, options, interactive)) {
    empty = keepEnvFile(envPath, options)
  }
  else {
    empty = await createEnvFile(root, envPath, options, interactive)
  }
  if (empty.length > 0) warn(`Still empty in ${envPath}: ${empty.join(', ')}. Fill them in before starting the app.`)

  // 2) Database: relative file URLs (file:./data/...) resolve against the project folder.
  process.chdir(dir)
  loadProjectEnv(dir)
  const config = databaseConfigFromEnv()
  console.log(`\nDatabase: ${describeDatabaseUrl(config.url)}`)
  try {
    const { applied, inbox } = await migrateDatabase(config)
    console.log(`Migrations: up to date (${applied} applied)`)
    console.log(`Inbox: ${inbox.name} (${inbox.key}, /${inbox.slug})`)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new SetupError(`Database setup failed (${reason}). Check NUXT_DATABASE_URL, then run pnpm db:migrate.`)
  }

  // 3) Next steps
  const login = process.env.NUXT_OWNER_GITHUB_LOGIN?.trim()
  console.log([
    '',
    'Done. Next steps:',
    ...(empty.length > 0 ? [`  0. Fill in ${empty.join(', ')} in ${envPath}`] : []),
    `  1. pnpm dev, then open http://localhost:3000 and sign in with GitHub${login ? ` as ${login}` : ''}`,
    ...(process.platform === 'win32'
      ? ['     (or pnpm service:install to run it always-on in the background, see README)']
      : []),
    '  2. In the app, Settings > API tokens: create a token for Claude Code',
    '  3. pnpm connect <folder> to connect the folder where you open Claude Code',
    '',
    'Optional: pnpm db:seed --demo adds two demo projects with sample tasks.',
  ].join('\n'))
}

async function main(): Promise<void> {
  const options = parseSetupArgs(process.argv.slice(2))
  if (options.help) {
    console.log(SETUP_USAGE)
    return
  }
  await run(options)
}

main().catch((error: unknown) => {
  if (error instanceof ArgsError) {
    console.error(`${error.message}\n\n${SETUP_USAGE}`)
  }
  else if (error instanceof SetupError) {
    console.error(`Error: ${error.message}`)
  }
  else {
    console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`)
  }
  process.exitCode = 1
})
