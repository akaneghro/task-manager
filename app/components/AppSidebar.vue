<template>
  <nav
    class="flex h-full flex-col overflow-y-auto"
    :aria-label="$t('nav.mainNav')"
  >
    <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
      <NuxtLink
        to="/tasks"
        class="rounded-md focus-visible:outline-2 focus-visible:outline-primary-500"
      >
        <AppLogo
          :size="26"
          with-text
        />
      </NuxtLink>
      <button
        v-if="closable"
        type="button"
        class="btn-ghost p-1.5 lg:hidden"
        :aria-label="$t('nav.closeMenu')"
        @click="emit('close')"
      >
        <Icon
          name="x"
          class="size-5"
        />
      </button>
    </div>

    <div class="px-3">
      <NuxtLink
        to="/tasks?focus=search"
        class="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-500 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-700"
      >
        <Icon
          name="search"
          class="size-4"
        />
        <span class="flex-1">{{ $t('nav.search') }}</span>
        <kbd class="rounded border border-gray-200 px-1.5 font-mono text-[11px] dark:border-gray-700">/</kbd>
      </NuxtLink>
    </div>

    <ul class="mt-3 space-y-0.5 px-3">
      <li>
        <NuxtLink
          to="/tasks"
          :class="linkClass('/tasks', true)"
        >
          <Icon
            name="checklist"
            class="size-4 shrink-0"
          />
          <span class="flex-1 truncate">{{ $t('nav.allTasks') }}</span>
        </NuxtLink>
      </li>
      <li>
        <NuxtLink
          to="/projects/inbox/tasks"
          :class="linkClass('/projects/inbox')"
        >
          <Icon
            name="inbox"
            class="size-4 shrink-0"
          />
          <span class="flex-1 truncate">{{ $t('nav.inbox') }}</span>
          <span
            v-if="inbox && inbox.openCount > 0"
            class="text-xs text-gray-400 tabular-nums dark:text-gray-500"
          >{{ inbox.openCount }}</span>
        </NuxtLink>
      </li>
      <li>
        <NuxtLink
          to="/projects"
          :class="linkClass('/projects', true)"
        >
          <Icon
            name="folder"
            class="size-4 shrink-0"
          />
          <span class="flex-1 truncate">{{ $t('nav.projects') }}</span>
        </NuxtLink>
      </li>
    </ul>

    <div class="mt-4 flex-1 space-y-4 px-3 pb-4">
      <p
        v-if="!pending && visibleGroups.length === 0 && groups.archived.length === 0"
        class="px-2 text-xs text-gray-400 dark:text-gray-500"
      >
        {{ $t('nav.noProjects') }}
      </p>

      <section
        v-for="status in visibleGroups"
        :key="status"
        :aria-labelledby="`sidebar-group-${status}`"
      >
        <h3
          :id="`sidebar-group-${status}`"
          class="px-2 pb-1 text-[11px] font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500"
        >
          {{ $t(`projectStatus.${status}`) }}
        </h3>
        <ul class="space-y-0.5">
          <li
            v-for="project in groups[status]"
            :key="project.id"
          >
            <NuxtLink
              :to="`/projects/${project.slug}`"
              :class="linkClass(`/projects/${project.slug}`)"
            >
              <span
                class="size-2.5 shrink-0 rounded-sm"
                :style="{ backgroundColor: project.color || undefined }"
                :class="project.color ? '' : 'bg-gray-300 dark:bg-gray-600'"
                aria-hidden="true"
              />
              <span class="flex-1 truncate">{{ project.name }}</span>
              <span
                v-if="project.openCount > 0"
                class="text-xs text-gray-400 tabular-nums dark:text-gray-500"
                :title="$t('nav.openTasks', { n: project.openCount }, project.openCount)"
              >{{ project.openCount }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="groups.archived.length > 0">
        <button
          type="button"
          class="flex w-full items-center gap-1 px-2 pb-1 text-[11px] font-semibold tracking-wide text-gray-400 uppercase hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          :aria-expanded="showArchived"
          aria-controls="sidebar-archived"
          @click="showArchived = !showArchived"
        >
          <Icon
            :name="showArchived ? 'chevron-down' : 'chevron-right'"
            class="size-3"
          />
          {{ $t('nav.archived') }} ({{ groups.archived.length }})
        </button>
        <ul
          v-show="showArchived"
          id="sidebar-archived"
          class="space-y-0.5"
        >
          <li
            v-for="project in groups.archived"
            :key="project.id"
          >
            <NuxtLink
              :to="`/projects/${project.slug}`"
              :class="linkClass(`/projects/${project.slug}`)"
            >
              <Icon
                name="archive"
                class="size-3.5 shrink-0 opacity-60"
              />
              <span class="flex-1 truncate opacity-75">{{ project.name }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>

    <div
      v-if="isOwner"
      class="sticky bottom-0 border-t border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-950"
    >
      <NuxtLink
        to="/projects?new=1"
        class="btn-ghost w-full justify-start"
      >
        <Icon
          name="plus"
          class="size-4"
        />
        {{ $t('nav.newProject') }}
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ closable?: boolean }>(), { closable: false })
const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const { groups, inbox, pending } = useProjects()
const { user } = useUserSession()
const isOwner = computed(() => toSessionUser(user.value)?.role === 'owner')

const showArchived = ref(false)

const visibleGroups = computed(() => PROJECT_STATUS_ORDER.filter(s => s !== 'archived' && groups.value[s].length > 0))

function isActive(path: string, exact = false): boolean {
  if (exact) return route.path === path
  return route.path === path || route.path.startsWith(`${path}/`)
}

function linkClass(path: string, exact = false): string {
  const base = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary-500'
  return isActive(path, exact)
    ? `${base} bg-primary-50 font-medium text-primary-700 dark:bg-primary-950 dark:text-primary-300`
    : `${base} text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800`
}
</script>
