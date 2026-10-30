<template>
  <div>
    <form
      class="flex flex-wrap items-center gap-2"
      @submit.prevent="submit"
    >
      <label
        :for="inputId"
        class="sr-only"
      >{{ $t('tasks.quickAdd.label') }}</label>
      <div class="relative min-w-48 flex-1">
        <Icon
          name="plus"
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
        />
        <input
          :id="inputId"
          ref="input"
          v-model="title"
          type="text"
          class="input pl-8"
          maxlength="200"
          autocomplete="off"
          :placeholder="$t('tasks.quickAdd.placeholder')"
          :disabled="saving"
          @keydown.esc="title = ''; input?.blur()"
        >
      </div>
      <select
        v-if="!projectSlug"
        v-model="project"
        class="input w-auto max-w-44"
        :aria-label="$t('tasks.quickAdd.project')"
        :disabled="saving"
      >
        <option
          v-for="p in projectOptions"
          :key="p.slug"
          :value="p.slug"
        >
          {{ p.name }}
        </option>
      </select>
      <button
        type="submit"
        class="btn-primary"
        :disabled="!title.trim() || saving"
      >
        {{ $t('tasks.quickAdd.add') }}
      </button>
      <button
        type="button"
        class="btn-ghost p-1.5"
        :title="$t('tasks.quickAdd.more')"
        :aria-label="$t('tasks.quickAdd.more')"
        @click="formOpen = true"
      >
        <Icon
          name="dots"
          class="size-4"
        />
      </button>
    </form>

    <AppModal
      v-model:open="formOpen"
      :title="$t('tasks.form.title')"
      size="lg"
    >
      <TaskForm
        v-if="formOpen"
        :project-slug="projectSlug ?? project"
        :fixed-project="Boolean(projectSlug)"
        :initial-title="title"
        @created="onFormCreated"
        @cancel="formOpen = false"
      />
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import type { TaskDetailDto } from '#shared/types/dto'
import { INBOX_PROJECT } from '#shared/utils/enums'
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  /** Fixed project (project page). On the global page a project select is shown (default Inbox). */
  projectSlug?: string | null
}>()
const emit = defineEmits<{ created: [task: TaskDetailDto] }>()

const { t } = useI18n()
const ui = useUiStore()
const toast = useToast()
const mutations = useTaskMutations()
const { projects } = useProjects()

const inputId = useId()
const input = useTemplateRef<HTMLInputElement>('input')
const title = ref('')
const project = ref<string>(INBOX_PROJECT.slug)
const saving = ref(false)
const formOpen = ref(false)

const projectOptions = computed(() => {
  const editable = projects.value.filter(p => p.status !== 'archived' && (p.capabilities?.edit ?? false))
  return editable.length > 0 ? editable : [{ slug: INBOX_PROJECT.slug, name: INBOX_PROJECT.name }]
})

watch(() => ui.quickAddSignal, async () => {
  await nextTick()
  input.value?.focus()
})

function focus() {
  input.value?.focus()
}

async function submit() {
  const value = title.value.trim()
  if (!value || saving.value) return
  saving.value = true
  try {
    const task = await mutations.createTask({ title: value, project: props.projectSlug ?? project.value })
    title.value = ''
    toast.success(t('tasks.quickAdd.created', { key: task.key }))
    emit('created', task)
    await nextTick()
    input.value?.focus()
  }
  catch (err) {
    mutations.reportError(err)
  }
  finally {
    saving.value = false
  }
}

function onFormCreated(task: TaskDetailDto) {
  formOpen.value = false
  title.value = ''
  toast.success(t('tasks.quickAdd.created', { key: task.key }))
  emit('created', task)
}

defineExpose({ focus })
</script>
