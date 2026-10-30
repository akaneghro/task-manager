<template>
  <div class="min-h-dvh">
    <a
      href="#main"
      class="sr-only z-50 rounded-md bg-primary-600 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >{{ $t('app.skipToContent') }}</a>

    <!-- Desktop sidebar -->
    <aside
      id="app-sidebar"
      class="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-gray-200 bg-gray-50 lg:block dark:border-gray-800 dark:bg-gray-950"
    >
      <AppSidebar />
    </aside>

    <!-- Mobile drawer -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-40 bg-gray-950/50 lg:hidden"
        aria-hidden="true"
        @click="drawerOpen = false"
      />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-200 ease-out"
      enter-from-class="-translate-x-full"
      leave-active-class="transition-transform duration-150 ease-in"
      leave-to-class="-translate-x-full"
    >
      <aside
        v-if="drawerOpen"
        class="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-gray-200 bg-gray-50 shadow-xl lg:hidden dark:border-gray-800 dark:bg-gray-950"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('nav.mainNav')"
        @keydown.esc="drawerOpen = false"
      >
        <AppSidebar
          closable
          @close="drawerOpen = false"
        />
      </aside>
    </Transition>

    <div class="flex min-h-dvh flex-col lg:pl-64">
      <AppTopBar
        :title="pageTitle"
        :sidebar-open="drawerOpen"
        @toggle-sidebar="drawerOpen = !drawerOpen"
      >
        <template #actions>
          <!-- Teleport target for page-level actions (e.g. <QuickAdd />). Use <Teleport to="#tm-topbar-actions" defer> inside <ClientOnly>. -->
          <div
            id="tm-topbar-actions"
            class="flex items-center gap-1"
          />
        </template>
      </AppTopBar>
      <main
        id="main"
        class="flex-1"
        tabindex="-1"
      >
        <slot />
      </main>
    </div>

    <AppToasts />
    <ConfirmDialog />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const drawerOpen = ref(false)
const pageTitle = usePageTitle()

watch(() => route.fullPath, () => {
  drawerOpen.value = false
})
</script>
