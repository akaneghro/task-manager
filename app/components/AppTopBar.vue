<template>
  <header class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-gray-200 bg-white/90 px-3 backdrop-blur sm:px-4 dark:border-gray-800 dark:bg-gray-950/90">
    <button
      type="button"
      class="btn-ghost p-2 lg:hidden"
      :aria-label="$t('nav.openMenu')"
      aria-controls="app-sidebar"
      :aria-expanded="sidebarOpen"
      @click="emit('toggle-sidebar')"
    >
      <Icon
        name="menu"
        class="size-5"
      />
    </button>

    <div class="min-w-0 flex-1">
      <slot name="title">
        <!-- Client-only: pages set the title during their own setup, which runs after the layout renders on
             the server, so an SSR title would always cause a hydration mismatch. Pages render their own <h1>. -->
        <ClientOnly>
          <p
            v-if="title"
            class="truncate text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {{ title }}
          </p>
        </ClientOnly>
      </slot>
    </div>

    <div class="flex items-center gap-1">
      <slot name="actions" />
      <LocaleSwitcher class="hidden sm:inline-flex" />
      <ThemeToggle />

      <div
        v-if="sessionUser"
        ref="menuRoot"
        class="relative ml-1"
      >
        <button
          type="button"
          class="flex items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          :aria-label="$t('nav.userMenu')"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          aria-controls="user-menu"
          @click="menuOpen = !menuOpen"
        >
          <img
            v-if="sessionUser.avatarUrl"
            :src="sessionUser.avatarUrl"
            alt=""
            class="size-8 rounded-full border border-gray-200 dark:border-gray-700"
            referrerpolicy="no-referrer"
          >
          <span
            v-else
            class="flex size-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900 dark:text-primary-200"
          >{{ initials(sessionUser.name || sessionUser.login) }}</span>
        </button>

        <div
          v-if="menuOpen"
          id="user-menu"
          role="menu"
          class="card absolute right-0 z-40 mt-2 w-56 py-1 shadow-lg"
          @keydown.esc="menuOpen = false"
        >
          <p class="truncate border-b border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {{ $t('nav.signedInAs', { login: sessionUser.login }) }}
          </p>
          <LocaleSwitcher
            class="mx-1 mt-1 flex sm:hidden"
            :compact="false"
          />
          <NuxtLink
            to="/settings"
            role="menuitem"
            class="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            @click="menuOpen = false"
          >
            <Icon
              name="settings"
              class="size-4"
            />
            {{ $t('nav.settings') }}
          </NuxtLink>
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            @click="logout"
          >
            <Icon
              name="logout"
              class="size-4"
            />
            {{ $t('nav.logout') }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string | null, sidebarOpen?: boolean }>(), { title: null, sidebarOpen: false })
const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const { user, clear } = useUserSession()
const sessionUser = computed(() => toSessionUser(user.value))
const projectsStore = useProjectsStore()

const menuOpen = ref(false)
const menuRoot = useTemplateRef<HTMLElement>('menuRoot')

function onDocumentClick(event: MouseEvent) {
  if (menuOpen.value && menuRoot.value && event.target instanceof Node && !menuRoot.value.contains(event.target)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

const route = useRoute()
watch(() => route.fullPath, () => {
  menuOpen.value = false
})

async function logout() {
  menuOpen.value = false
  await clear()
  projectsStore.reset()
  await navigateTo('/login')
}
</script>
