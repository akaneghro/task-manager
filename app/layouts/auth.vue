<template>
  <div class="relative flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-gray-50 px-4 py-10 dark:from-gray-900 dark:to-gray-950">
    <div class="absolute top-3 right-3 flex items-center gap-1">
      <LocaleSwitcher />
      <ThemeToggle />
    </div>
    <main
      id="main"
      class="w-full max-w-sm"
    >
      <slot />
    </main>
    <AppToasts />
  </div>
</template>
