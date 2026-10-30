<template>
  <div class="flex min-h-dvh flex-col items-center justify-center bg-gray-50 px-4 text-center dark:bg-gray-950">
    <div class="absolute top-3 right-3 flex items-center gap-1">
      <LocaleSwitcher />
      <ThemeToggle />
    </div>
    <AppLogo :size="44" />
    <p class="mt-6 font-mono text-5xl font-bold text-primary-600 dark:text-primary-400">
      {{ statusCode }}
    </p>
    <h1 class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-50">
      {{ isNotFound ? $t('errors.pageNotFound') : $t('errors.pageError') }}
    </h1>
    <p class="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
      {{ isNotFound ? $t('errors.pageNotFoundHint') : $t('errors.generic') }}
    </p>
    <button
      type="button"
      class="btn-primary mt-6"
      @click="goHome"
    >
      <Icon
        name="arrow-left"
        class="size-4"
      />
      {{ $t('errors.backHome') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const statusCode = computed(() => props.error.statusCode || 500)
const isNotFound = computed(() => statusCode.value === 404)

useHead({ title: () => `${statusCode.value} · Task Manager` })

// Make sure the colour mode is applied on the error page too.
useColorMode()

function goHome() {
  clearError({ redirect: '/' })
}
</script>
