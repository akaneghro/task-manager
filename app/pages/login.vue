<template>
  <div class="card p-6 shadow-sm sm:p-8">
    <div class="mb-6 flex flex-col items-center text-center">
      <AppLogo :size="48" />
      <h1 class="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-50">
        Task Manager
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {{ $t('app.tagline') }}
      </p>
    </div>

    <div
      v-if="errorMessage"
      role="alert"
      class="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <Icon
        name="alert"
        class="mt-0.5 size-4 shrink-0"
      />
      <span>{{ errorMessage }}</span>
    </div>

    <h2 class="sr-only">
      {{ $t('auth.title') }}
    </h2>
    <a
      href="/auth/github"
      class="btn w-full justify-center bg-gray-900 py-2.5 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      @click.prevent="login"
    >
      <Icon
        name="github"
        class="size-5"
      />
      {{ $t('auth.github') }}
    </a>
    <p class="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
      {{ $t('auth.subtitle') }}
    </p>

    <div
      v-if="isDev"
      class="mt-6 border-t border-dashed border-gray-200 pt-4 text-center dark:border-gray-800"
    >
      <a
        href="/auth/dev"
        class="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
        @click.prevent="devLogin"
      >{{ $t('auth.devLogin') }}</a>
      <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
        {{ $t('auth.devHint') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const { loggedIn } = useUserSession()

useHead({ title: () => `${t('auth.title')} · Task Manager` })

if (loggedIn.value) await navigateTo('/tasks', { replace: true })

const isDev = import.meta.dev

const errorMessage = computed(() => {
  const code = route.query.error
  if (typeof code !== 'string' || !code) return null
  if (code === 'not_invited') return t('auth.errors.not_invited')
  if (code === 'oauth') return t('auth.errors.oauth')
  return t('auth.errors.generic')
})

async function login() {
  await navigateTo('/auth/github', { external: true })
}

async function devLogin() {
  await navigateTo('/auth/dev', { external: true })
}
</script>
