import tailwindcss from '@tailwindcss/vite'

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
    // Dev-only owner login without GitHub (see server/routes/auth/dev.get.ts)
    devLogin: false,
    session: {
      // Set NUXT_SESSION_PASSWORD (32+ chars). nuxt-auth-utils generates one in dev if missing.
      password: '',
      maxAge: 60 * 60 * 24 * 30,
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
