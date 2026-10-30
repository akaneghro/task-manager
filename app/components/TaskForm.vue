<template>
  <form
    class="space-y-4"
    @submit.prevent="submit"
  >
    <div>
      <label
        :for="`${id}-title`"
        class="label"
      >{{ $t('tasks.fields.title') }}</label>
      <input
        :id="`${id}-title`"
        v-model="title"
        type="text"
        class="input"
        maxlength="200"
        required
        autofocus
        :placeholder="$t('tasks.form.titlePlaceholder')"
      >
    </div>

    <div
      v-if="!fixedProject"
    >
      <label
        :for="`${id}-project`"
        class="label"
      >{{ $t('tasks.fields.project') }}</label>
      <select
        :id="`${id}-project`"
        v-model="project"
        class="input"
      >
        <option
          v-for="p in projectOptions"
          :key="p.slug"
          :value="p.slug"
        >
          {{ p.name }}
        </option>
      </select>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div>
        <label
          :for="`${id}-status`"
          class="label"
        >{{ $t('tasks.fields.status') }}</label>
        <select
          :id="`${id}-status`"
          v-model="status"
          class="input"
        >
          <option
            v-for="s in TASK_STATUSES"
            :key="s"
            :value="s"
          >
            {{ $t(taskStatusLabelKey(s)) }}
          </option>
        </select>
      </div>
      <div>
        <label
          :for="`${id}-priority`"
          class="label"
        >{{ $t('tasks.fields.priority') }}</label>
        <select
          :id="`${id}-priority`"
          v-model="priority"
          class="input"
        >
          <option
            v-for="p in TASK_PRIORITIES"
            :key="p"
            :value="p"
          >
            {{ $t(taskPriorityLabelKey(p)) }}
          </option>
        </select>
      </div>
      <div>
        <label
          :for="`${id}-type`"
          class="label"
        >{{ $t('tasks.fields.type') }}</label>
        <select
          :id="`${id}-type`"
          v-model="type"
          class="input"
        >
          <option
            v-for="ty in TASK_TYPES"
            :key="ty"
            :value="ty"
          >
            {{ $t(taskTypeLabelKey(ty)) }}
          </option>
        </select>
      </div>
      <div>
        <label
          :for="`${id}-size`"
          class="label"
        >{{ $t('tasks.fields.size') }}</label>
        <select
          :id="`${id}-size`"
          v-model="size"
          class="input"
        >
          <option :value="null">
            {{ $t('tasks.size.none') }}
          </option>
          <option
            v-for="s in TASK_SIZES"
            :key="s"
            :value="s"
          >
            {{ s }}
          </option>
        </select>
      </div>
      <div>
        <label
          :for="`${id}-executor`"
          class="label"
        >{{ $t('tasks.fields.executor') }}</label>
        <select
          :id="`${id}-executor`"
          v-model="executor"
          class="input"
        >
          <option
            v-for="e in TASK_EXECUTORS"
            :key="e"
            :value="e"
          >
            {{ $t(taskExecutorLabelKey(e)) }}
          </option>
        </select>
      </div>
      <div>
        <label
          :for="`${id}-due`"
          class="label"
        >{{ $t('tasks.fields.due') }}</label>
        <input
          :id="`${id}-due`"
          v-model="dueDate"
          type="date"
          class="input"
        >
      </div>
    </div>

    <div>
      <span class="label">{{ $t('tasks.fields.description') }}</span>
      <MarkdownEditor
        v-model="description"
        :rows="5"
        :placeholder="$t('tasks.form.descriptionPlaceholder')"
      />
    </div>

    <div>
      <label
        :for="`${id}-checklist`"
        class="label"
      >{{ $t('tasks.fields.checklist') }}</label>
      <textarea
        :id="`${id}-checklist`"
        v-model="checklistText"
        class="input font-mono"
        rows="3"
        :placeholder="$t('tasks.form.checklistHint')"
      />
    </div>

    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="btn-secondary"
        @click="emit('cancel')"
      >
        {{ $t('tasks.form.cancel') }}
      </button>
      <button
        type="submit"
        class="btn-primary"
        :disabled="!title.trim() || saving"
      >
        {{ $t('tasks.form.create') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { TASK_EXECUTORS, TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES, TASK_TYPES, INBOX_PROJECT } from '#shared/utils/enums'
import type { TaskExecutor, TaskPriority, TaskSize, TaskStatus, TaskType } from '#shared/utils/enums'
import type { TaskDetailDto } from '#shared/types/dto'
import {
  taskExecutorLabelKey,
  taskPriorityLabelKey,
  taskStatusLabelKey,
  taskTypeLabelKey,
} from '~/utils/taskDisplay'

const props = defineProps<{
  projectSlug?: string | null
  /** Hide the project select (project page). */
  fixedProject?: boolean
  initialTitle?: string
}>()
const emit = defineEmits<{ created: [task: TaskDetailDto], cancel: [] }>()

const mutations = useTaskMutations()
const { projects } = useProjects()
const id = useId()

const title = ref(props.initialTitle ?? '')
const project = ref<string>(props.projectSlug ?? INBOX_PROJECT.slug)
const status = ref<TaskStatus>('todo')
const priority = ref<TaskPriority>('medium')
const type = ref<TaskType>('feature')
const size = ref<TaskSize | null>(null)
const executor = ref<TaskExecutor>('ai')
const dueDate = ref('')
const description = ref('')
const checklistText = ref('')
const saving = ref(false)

const projectOptions = computed(() => {
  const editable = projects.value.filter(p => p.status !== 'archived' && (p.capabilities?.edit ?? true))
  return editable.length > 0 ? editable : [{ slug: INBOX_PROJECT.slug, name: INBOX_PROJECT.name }]
})

async function submit() {
  const value = title.value.trim()
  if (!value || saving.value) return
  saving.value = true
  try {
    const checklist = checklistText.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 50)
    const task = await mutations.createTask({
      project: props.fixedProject ? (props.projectSlug ?? undefined) : project.value,
      title: value,
      description: description.value,
      status: status.value,
      priority: priority.value,
      type: type.value,
      size: size.value,
      executor: executor.value,
      dueDate: dueDate.value || null,
      checklist: checklist.length > 0 ? checklist : undefined,
    })
    emit('created', task)
  }
  catch (err) {
    mutations.reportError(err)
  }
  finally {
    saving.value = false
  }
}
</script>
