<template>
  <div class="space-y-3">
    <div
      v-for="section in sections"
      :key="section.kind"
    >
      <h4 class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
        {{ $t(section.kind === 'blockedBy' ? 'tasks.deps.blockedBy' : 'tasks.deps.blocking') }}
      </h4>
      <ul class="space-y-1">
        <li
          v-for="link in section.links"
          :key="link.linkId"
          class="group flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          <NuxtLink
            v-if="!readonly"
            :to="`/tasks/${link.key}`"
            class="shrink-0 font-mono text-xs text-primary-700 hover:underline dark:text-primary-300"
          >
            {{ link.key }}
          </NuxtLink>
          <span
            v-else
            class="shrink-0 font-mono text-xs text-gray-600 dark:text-gray-300"
          >{{ link.key }}</span>
          <span
            class="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200"
            :class="link.status === 'done' || link.status === 'cancelled' ? 'text-gray-400 line-through dark:text-gray-500' : ''"
          >{{ link.title }}</span>
          <StatusBadge :status="link.status" />
          <button
            v-if="!readonly"
            type="button"
            class="btn-ghost p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="$t('tasks.deps.remove')"
            :disabled="busy"
            @click="removeLink(link, section.kind)"
          >
            <Icon
              name="x"
              class="size-3.5"
            />
          </button>
        </li>
      </ul>
    </div>

    <p
      v-if="task.hiddenDependencies > 0"
      class="text-xs text-gray-500 dark:text-gray-400"
      :title="$t('tasks.deps.hiddenTitle')"
    >
      <Icon
        name="eye-off"
        class="inline size-3.5"
      />
      {{ $t('tasks.deps.hidden', task.hiddenDependencies) }}
    </p>

    <p
      v-if="sections.length === 0 && task.hiddenDependencies === 0 && (readonly || !adding)"
      class="text-sm text-gray-400 dark:text-gray-500"
    >
      {{ $t('tasks.deps.none') }}
    </p>

    <div v-if="!readonly">
      <button
        v-if="!adding"
        type="button"
        class="btn-ghost px-2 py-1 text-xs"
        @click="startAdding"
      >
        <Icon
          name="plus"
          class="size-3.5"
        />
        {{ $t('tasks.deps.add') }}
      </button>
      <div
        v-else
        class="relative"
      >
        <label
          :for="`${id}-search`"
          class="sr-only"
        >{{ $t('tasks.deps.searchLabel') }}</label>
        <input
          :id="`${id}-search`"
          ref="searchInput"
          v-model="query"
          type="search"
          class="input"
          autocomplete="off"
          :placeholder="$t('tasks.deps.searchPlaceholder')"
          @input="scheduleSearch"
          @keydown.esc.stop="stopAdding"
          @keydown.enter.prevent="results[0] && addBlockedBy(results[0])"
        >
        <ul
          v-if="query.trim()"
          class="card absolute inset-x-0 z-20 mt-1 max-h-64 overflow-y-auto p-1 shadow-lg"
        >
          <li
            v-for="result in results"
            :key="result.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 focus-visible:bg-gray-100 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800"
              :disabled="busy"
              @click="addBlockedBy(result)"
            >
              <span class="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">{{ result.key }}</span>
              <span class="min-w-0 flex-1 truncate">{{ result.title }}</span>
              <StatusBadge :status="result.status" />
            </button>
          </li>
          <li
            v-if="!searching && results.length === 0"
            class="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400"
          >
            {{ $t('tasks.deps.noResults') }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskDetailDto, TaskLinkRefDto, TaskListDto, TaskSummaryDto } from '#shared/types/dto'

type DependencyPatch = Pick<TaskDetailDto, 'blockedBy' | 'blocking' | 'hiddenDependencies'>

const props = defineProps<{
  task: TaskDetailDto
  readonly?: boolean
}>()
const emit = defineEmits<{ updated: [patch: DependencyPatch] }>()

const mutations = useTaskMutations()
const id = useId()

const adding = ref(false)
const query = ref('')
const results = ref<TaskSummaryDto[]>([])
const searching = ref(false)
const busy = ref(false)
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

const sections = computed(() => {
  const out: { kind: 'blockedBy' | 'blocking', links: TaskLinkRefDto[] }[] = []
  if (props.task.blockedBy.length > 0) out.push({ kind: 'blockedBy', links: props.task.blockedBy })
  if (props.task.blocking.length > 0) out.push({ kind: 'blocking', links: props.task.blocking })
  return out
})

async function startAdding() {
  adding.value = true
  await nextTick()
  searchInput.value?.focus()
}

function stopAdding() {
  adding.value = false
  query.value = ''
  results.value = []
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 250)
}

async function runSearch() {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    return
  }
  const seq = ++searchSeq
  searching.value = true
  try {
    const list = await apiFetch<TaskListDto>('/api/tasks', { query: { q, includeClosed: true, limit: 10, sort: 'updated' } })
    if (seq !== searchSeq) return
    const linked = new Set(props.task.blockedBy.map(link => link.taskId))
    results.value = list.items.filter(item => item.id !== props.task.id && !linked.has(item.id))
  }
  catch (err) {
    if (seq === searchSeq) mutations.reportError(err)
  }
  finally {
    if (seq === searchSeq) searching.value = false
  }
}

async function addBlockedBy(blocker: TaskSummaryDto) {
  if (busy.value) return
  busy.value = true
  try {
    const updated = await mutations.addBlockedBy(props.task.id, blocker.key)
    emit('updated', { blockedBy: updated.blockedBy, blocking: updated.blocking, hiddenDependencies: updated.hiddenDependencies })
    stopAdding()
  }
  catch (err) {
    mutations.reportError(err)
  }
  finally {
    busy.value = false
  }
}

async function removeLink(link: TaskLinkRefDto, kind: 'blockedBy' | 'blocking') {
  if (busy.value) return
  busy.value = true
  const before: DependencyPatch = { blockedBy: props.task.blockedBy, blocking: props.task.blocking, hiddenDependencies: props.task.hiddenDependencies }
  emit('updated', {
    ...before,
    [kind]: props.task[kind].filter(l => l.linkId !== link.linkId),
  })
  try {
    await mutations.removeLink(link.linkId)
  }
  catch (err) {
    emit('updated', before)
    mutations.reportError(err)
  }
  finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>
