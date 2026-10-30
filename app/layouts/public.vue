<template>
  <div class="flex min-h-dvh flex-col">
    <header class="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <AppLogo :size="26" />
        <span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <Icon
            name="eye"
            class="size-3.5"
          />
          {{ $t('public.readOnly') }}
        </span>
        <div class="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
    <main
      id="main"
      class="mx-auto w-full max-w-6xl flex-1 px-4 py-6"
    >
      <slot />
    </main>
    <footer class="border-t border-gray-200 py-4 text-center text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
      <span class="inline-flex items-center gap-1.5">
        <AppLogo :size="14" />
        {{ $t('app.poweredBy', { name: 'Task Manager' }) }}
      </span>
    </footer>
    <AppToasts />
  </div>
</template>

<script setup lang="ts">
useSeoMeta({ robots: 'noindex, nofollow' })
</script>
