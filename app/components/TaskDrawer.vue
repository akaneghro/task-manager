<template>
  <!-- Client-only overlay: several teleports share #teleports and SSR-hydrating them out of order caused mismatches. -->
  <ClientOnly>
    <Teleport to="#teleports">
      <Transition
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="taskKey"
          class="fixed inset-0 z-45 bg-gray-950/30"
          aria-hidden="true"
          @click="close"
        />
      </Transition>
      <Transition
        enter-active-class="transition-transform duration-200 ease-out"
        enter-from-class="translate-x-full"
        leave-active-class="transition-transform duration-150 ease-in"
        leave-to-class="translate-x-full"
      >
        <aside
          v-if="taskKey"
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-label="task ? `${task.key} ${task.title}` : taskKey"
          tabindex="-1"
          class="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-gray-200 bg-white shadow-2xl outline-none dark:border-gray-800 dark:bg-gray-950"
        >
          <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div
              v-if="pending && !task"
              class="space-y-3"
              aria-busy="true"
            >
              <div class="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              <div class="h-6 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              <div class="h-32 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
            </div>
            <template v-else-if="task">
              <TaskDetail
                :task="task"
                @updated="onUpdated"
                @deleted="onDeleted"
              >
                <template #actions>
                  <NuxtLink
                    :to="`/tasks/${task.key}`"
                    class="btn-ghost p-1.5"
                    :title="$t('tasks.detail.openFull')"
                    :aria-label="$t('tasks.detail.openFull')"
                  >
                    <Icon
                      name="external"
                      class="size-4"
                    />
                  </NuxtLink>
                  <button
                    type="button"
                    class="btn-ghost p-1.5"
                    :aria-label="$t('tasks.detail.close')"
                    @click="close"
                  >
                    <Icon
                      name="x"
                      class="size-4"
                    />
                  </button>
                </template>
              </TaskDetail>
            </template>
            <div v-else>
              <div class="flex justify-end">
                <button
                  type="button"
                  class="btn-ghost p-1.5"
                  :aria-label="$t('tasks.detail.close')"
                  @click="close"
                >
                  <Icon
                    name="x"
                    class="size-4"
                  />
                </button>
              </div>
              <EmptyState
                icon="alert"
                :title="$t('tasks.detail.notFound')"
                :description="$t('tasks.detail.notFoundDescription')"
              />
            </div>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { TaskDetailDto } from '#shared/types/dto'

const emit = defineEmits<{
  updated: [task: TaskDetailDto]
  deleted: [task: TaskDetailDto]
}>()

const route = useRoute()
const router = useRouter()
const panel = useTemplateRef<HTMLElement>('panel')

const taskKey = computed(() => {
  const value = route.query.task
  const key = Array.isArray(value) ? value[0] : value
  return typeof key === 'string' && key.trim() ? key.trim() : null
})

const { task, pending, setTask, refresh } = useTask(taskKey)

// aria-modal: Tab must not reach the list and filters behind the drawer.
useFocusTrap(panel, () => taskKey.value !== null)

function close() {
  const { task: _omit, ...query } = route.query
  void router.replace({ query })
}

// Esc closes the drawer (ignored while typing: there Esc cancels the field edit).
useShortcuts({ onEscape: () => {
  if (taskKey.value) close()
} })

let previousFocus: HTMLElement | null = null
watch(taskKey, async (key, oldKey) => {
  if (!import.meta.client) return
  if (key && !oldKey) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    panel.value?.focus()
  }
  else if (!key && oldKey) {
    previousFocus?.focus()
    previousFocus = null
  }
})

function onUpdated(updated: TaskDetailDto) {
  setTask(updated)
  emit('updated', updated)
}

function onDeleted(deleted: TaskDetailDto) {
  emit('deleted', deleted)
  close()
}

defineExpose({ refresh })
</script>
