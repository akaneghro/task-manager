import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

/**
 * libSQL loads its prebuilt native binding (`@libsql/<platform>`) with a dynamic require that Nitro's file
 * tracer cannot follow, so the production build would miss it. Resolve the binding installed for this
 * platform and trace it explicitly.
 */
function libsqlNativeBindings(): string[] {
  try {
    // Neither package exports its package.json: walk from the real (pnpm) location of @libsql/client.
    const clientDir = realpathSync(join(process.cwd(), 'node_modules', '@libsql', 'client'))
    const libsqlEntry = createRequire(join(clientDir, 'package.json')).resolve('libsql')
    const libsqlDir = dirname(libsqlEntry)
    const pkg: { optionalDependencies?: Record<string, string> } = JSON.parse(readFileSync(join(libsqlDir, 'package.json'), 'utf8'))
    const fromLibsql = createRequire(libsqlEntry)
    return Object.keys(pkg.optionalDependencies ?? {}).flatMap((name) => {
      try {
        return [fromLibsql.resolve(name)]
      }
      catch {
        return [] // not installed for this platform
      }
    })
  }
  catch {
    return []
  }
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    'nuxt-auth-utils',
  ],
  devtools: { enabled: false },

  app: {
    head: {
      title: 'Task Manager',
      htmlAttrs: { lang: 'es' },
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'theme-color', content: '#0284c7' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Server-only values. Override them with NUXT_* environment variables.
    ownerGithubLogin: '',
    ownerGithubId: '',
    vaultKey: '',
    databaseUrl: 'file:./data/task-manager.db',
    databaseAuthToken: '',
    // IANA time zone for server-side "today" defaults (e.g. a blocker's "since"). Empty = Europe/Madrid.
    timezone: '',
    // Dev-only owner login without GitHub (see server/routes/auth/dev.get.ts)
    devLogin: false,
    session: {
      // Set NUXT_SESSION_PASSWORD (32+ chars). nuxt-auth-utils generates one in dev if missing.
      password: '',
      maxAge: 60 * 60 * 24 * 30,
      // Explicit: Lax keeps the session cookie out of cross-site frames and cross-site subrequests.
      cookie: { sameSite: 'lax' },
    },
    oauth: {
      github: {
        clientId: '',
        clientSecret: '',
        redirectURL: '',
      },
    },
    public: {
      siteUrl: 'http://localhost:3000',
    },
  },

  routeRules: {
    '/s/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    '/api/public/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
  },
  compatibilityDate: '2026-10-01',

  nitro: {
    externals: {
      traceInclude: libsqlNativeBindings(),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'es',
    langDir: 'locales',
    locales: [
      { code: 'es', language: 'es-ES', name: 'Español', files: ['es/app.json', 'es/tasks.json'] },
      { code: 'en', language: 'en-US', name: 'English', files: ['en/app.json', 'en/tasks.json'] },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'tm_locale',
      redirectOn: 'root',
      fallbackLocale: 'es',
    },
  },
})
