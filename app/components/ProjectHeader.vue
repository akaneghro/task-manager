<template>
  <div class="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
    <div class="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
      <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          class="mt-1.5 size-3.5 shrink-0 rounded"
          :style="{ backgroundColor: project.color || undefined }"
          :class="project.color ? '' : 'bg-gray-300 dark:bg-gray-600'"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="truncate text-xl font-semibold text-gray-900 dark:text-gray-50">
              {{ project.name }}
            </h1>
            <span
              class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              :title="$t('project.key')"
            >{{ project.key }}</span>
            <ProjectStatusBadge :status="project.status" />
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <span
              v-if="project.client"
              class="inline-flex items-center gap-1"
            >
              <Icon
                name="user"
                class="size-3.5"
              />
              <span class="sr-only">{{ $t('project.client') }}:</span>
              {{ project.client }}
            </span>
            <a
              v-for="link in sortedLinks"
              :key="link.id"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 hover:text-primary-600 hover:underline dark:hover:text-primary-400"
            >
              <Icon
                :name="link.kind === 'repo' ? 'github' : 'link'"
                class="size-3.5"
              />
              {{ link.label }}
            </a>
          </div>
        </div>
        <slot name="actions" />
      </div>

      <nav
        class="-mb-px mt-4 flex gap-1 overflow-x-auto"
        :aria-label="$t('project.tabsLabel')"
      >
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap"
          :class="isActive(tab)
            ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200'"
          :aria-current="isActive(tab) ? 'page' : undefined"
        >
          <Icon
            :name="tab.icon"
            class="size-4"
          />
          {{ $t(`project.tabs.${tab.key}`) }}
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProjectLinkDto, ProjectSummaryDto } from '#shared/types/dto'
import type { IconName } from './Icon.vue'

const props = defineProps<{
  project: ProjectSummaryDto & { links?: ProjectLinkDto[] }
}>()

interface Tab {
  key: 'overview' | 'tasks' | 'vault' | 'settings'
  to: string
  icon: IconName
}

const route = useRoute()

const sortedLinks = computed(() => [...(props.project.links ?? [])].sort((a, b) => a.position - b.position))

const tabs = computed<Tab[]>(() => {
  const base = `/projects/${props.project.slug}`
  const caps = props.project.capabilities
  const list: Tab[] = [
    { key: 'overview', to: base, icon: 'folder' },
    { key: 'tasks', to: `${base}/tasks`, icon: 'checklist' },
  ]
  if (caps?.vault) list.push({ key: 'vault', to: `${base}/vault`, icon: 'lock' })
  if (caps?.manage) list.push({ key: 'settings', to: `${base}/settings`, icon: 'settings' })
  return list
})

function isActive(tab: Tab): boolean {
  return route.path === tab.to || (tab.key !== 'overview' && route.path.startsWith(`${tab.to}/`))
}
</script>
