<template>
  <div
    ref="root"
    class="flex flex-wrap items-center gap-2"
    role="search"
  >
    <div class="relative w-full sm:w-64">
      <Icon
        name="search"
        class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
      />
      <label
        :for="`${id}-q`"
        class="sr-only"
      >{{ $t('tasks.filters.searchLabel') }}</label>
      <input
        :id="`${id}-q`"
        ref="searchInput"
        v-model="search"
        type="search"
        class="input pl-8"
        maxlength="200"
        :placeholder="$t('tasks.filters.search')"
        @input="scheduleSearch"
        @keydown.enter.prevent="commitSearch"
        @keydown.esc="onSearchEscape"
      >
    </div>

    <div
      v-for="group in groups"
      :key="group.key"
      class="relative"
    >
      <button
        type="button"
        class="btn-secondary px-2.5 py-1 text-xs"
        :class="model[group.key].length > 0 ? 'border-primary-400 text-primary-700 dark:border-primary-700 dark:text-primary-300' : ''"
        :aria-expanded="openGroup === group.key"
        :aria-controls="`${id}-${group.key}`"
        @click="toggleGroup(group.key)"
      >
        {{ $t(`tasks.fields.${group.key}`) }}
        <span
          v-if="model[group.key].length > 0"
          class="rounded-full bg-primary-100 px-1.5 text-[11px] text-primary-700 dark:bg-primary-900 dark:text-primary-200"
        >{{ model[group.key].length }}</span>
        <Icon
          name="chevron-down"
          class="size-3"
        />
      </button>
      <div
        v-if="openGroup === group.key"
        :id="`${id}-${group.key}`"
        class="card absolute left-0 z-20 mt-1 w-52 p-1 shadow-lg"
        @keydown.esc.stop="openGroup = null"
      >
        <label
          v-for="value in group.values"
          :key="value"
          class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <input
            type="checkbox"
            class="size-4 rounded border-gray-300 text-primary-600 dark:border-gray-600"
            :checked="(model[group.key] as readonly string[]).includes(value)"
            @change="toggleValue(group.key, value)"
          >
          <span>{{ $t(`${group.labelPrefix}.${value}`) }}</span>
        </label>
      </div>
    </div>

    <select
      v-if="showProject"
      :value="model.project ?? ''"
      class="input w-auto max-w-48 py-1 text-xs"
      :aria-label="$t('tasks.fields.project')"
      @change="onProjectChange"
    >
      <option value="">
        {{ $t('tasks.filters.allProjects') }}
      </option>
      <option
        v-for="p in projects"
        :key="p.slug"
        :value="p.slug"
      >
        {{ p.name }}
      </option>
    </select>

    <select
      :value="model.sort"
      class="input w-auto py-1 text-xs"
      :aria-label="$t('tasks.sort.label')"
      @change="onSortChange"
    >
      <option
        v-for="s in TASK_SORTS"
        :key="s"
        :value="s"
      >
        {{ $t('tasks.sort.label') }}: {{ $t(`tasks.sort.${s}`) }}
      </option>
    </select>

    <label class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
      <input
        type="checkbox"
        class="size-4 rounded border-gray-300 text-primary-600 dark:border-gray-600"
        :checked="model.includeClosed"
        @change="update({ includeClosed: !model.includeClosed })"
      >
      {{ $t('tasks.filters.includeClosed') }}
    </label>

    <button
      v-if="activeCount > 0"
      type="button"
      class="btn-ghost px-2 py-1 text-xs"
      @click="clearAll"
    >
      <Icon
        name="x"
        class="size-3.5"
      />
      {{ $t('tasks.filters.clear') }}
      <span class="text-gray-400">({{ activeCount }})</span>
    </button>

    <span
      v-if="total !== undefined"
      class="ml-auto text-xs text-gray-500 dark:text-gray-400"
      aria-live="polite"
    >
      <template v-if="shown !== undefined && shown !== total">{{ $t('tasks.filters.results', { shown, total }) }}</template>
      <template v-else>{{ $t('tasks.count', total) }}</template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { TASK_SORTS } from '#shared/schemas/task'
import type { TaskSort } from '#shared/schemas/task'
import { TASK_FILTER_LIST_OPTIONS, countActiveTaskFilters, emptyTaskFilters } from '~/composables/useTaskFilters'
import type { TaskFilterListKey, TaskFilters } from '~/composables/useTaskFilters'
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  /** Global page: show the project select. */
  showProject?: boolean
  /** Total matching tasks (server) and number shown. */
  total?: number
  shown?: number
}>()
const model = defineModel<TaskFilters>({ required: true })

const id = useId()
const ui = useUiStore()
const { projects: allProjects } = useProjects()
const root = useTemplateRef<HTMLElement>('root')
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')

const groups: { key: TaskFilterListKey, values: readonly string[], labelPrefix: string }[] = [
  { key: 'status', values: TASK_FILTER_LIST_OPTIONS.status, labelPrefix: 'tasks.status' },
  { key: 'priority', values: TASK_FILTER_LIST_OPTIONS.priority, labelPrefix: 'tasks.priority' },
  { key: 'type', values: TASK_FILTER_LIST_OPTIONS.type, labelPrefix: 'tasks.type' },
  { key: 'executor', values: TASK_FILTER_LIST_OPTIONS.executor, labelPrefix: 'tasks.executor' },
  { key: 'assignee', values: TASK_FILTER_LIST_OPTIONS.assignee, labelPrefix: 'tasks.assignee' },
]

const projects = computed(() => (props.showProject ? allProjects.value : []))
const activeCount = computed(() => countActiveTaskFilters(model.value))
const openGroup = ref<TaskFilterListKey | null>(null)

// Search: local text, debounced into the URL.
const search = ref(model.value.q)
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => model.value.q, (q) => {
  if (!import.meta.client || document.activeElement !== searchInput.value) search.value = q
})

function update(patch: Partial<TaskFilters>) {
  model.value = { ...model.value, ...patch }
}

function commitSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = null
  const q = search.value.trim()
  if (q !== model.value.q) update({ q })
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(commitSearch, 300)
}

function onSearchEscape() {
  if (search.value) {
    search.value = ''
    commitSearch()
  }
  else {
    searchInput.value?.blur()
  }
}

function toggleGroup(key: TaskFilterListKey) {
  openGroup.value = openGroup.value === key ? null : key
}

function toggleValue(key: TaskFilterListKey, value: string) {
  const current = model.value[key] as readonly string[]
  const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
  update({ [key]: next } as Partial<TaskFilters>)
}

function onProjectChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  update({ project: value || null })
}

function onSortChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const sort = TASK_SORTS.find(s => s === value)
  if (sort) update({ sort: sort satisfies TaskSort })
}

function clearAll() {
  search.value = ''
  model.value = { ...emptyTaskFilters(), sort: model.value.sort }
}

function focusSearch() {
  searchInput.value?.focus()
  searchInput.value?.select()
}

watch(() => ui.searchSignal, () => focusSearch())

// `?focus=search` (sidebar search hint): focus the box once, then drop the param so reloads don't re-trigger it.
const route = useRoute()
const router = useRouter()
function consumeFocusQuery() {
  if (route.query.focus !== 'search') return
  focusSearch()
  const { focus: _focus, ...rest } = route.query
  void router.replace({ query: rest })
}
watch(() => route.query.focus, () => nextTick(consumeFocusQuery))

function onDocumentClick(event: MouseEvent) {
  if (openGroup.value && root.value && event.target instanceof Node && !root.value.contains(event.target)) {
    openGroup.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  consumeFocusQuery()
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  if (searchTimer) clearTimeout(searchTimer)
})

defineExpose({ focusSearch })
</script>
