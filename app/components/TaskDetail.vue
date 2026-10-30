<template>
  <div class="@container">
    <!-- Header: key, project, actions -->
    <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <button
        type="button"
        class="inline-flex items-center gap-1 font-mono font-medium text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400"
        :title="$t('tasks.detail.copyKey')"
        @click="copyKey"
      >
        {{ task.key }}
        <Icon
          name="copy"
          class="size-3"
        />
      </button>
      <span aria-hidden="true">·</span>
      <NuxtLink
        v-if="!readonly"
        :to="`/projects/${task.projectSlug}/tasks`"
        class="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400"
      >
        <Icon
          name="folder"
          class="size-3.5"
        />
        {{ task.projectName }}
      </NuxtLink>
      <span v-else>{{ task.projectName }}</span>
      <span
        v-if="!canEdit && !readonly"
        class="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-gray-800"
      >{{ $t('tasks.detail.readonly') }}</span>
      <div class="ml-auto flex items-center gap-1">
        <button
          v-if="canDelete"
          type="button"
          class="btn-ghost p-1.5 hover:text-red-600 dark:hover:text-red-400"
          :title="$t('tasks.detail.delete')"
          :aria-label="$t('tasks.detail.delete')"
          @click="removeTask"
        >
          <Icon
            name="trash"
            class="size-4"
          />
        </button>
        <slot name="actions" />
      </div>
    </div>

    <!-- Title -->
    <div class="mt-2">
      <form
        v-if="editingTitle"
        @submit.prevent="saveTitle"
      >
        <label
          :for="`${id}-title`"
          class="sr-only"
        >{{ $t('tasks.detail.titleLabel') }}</label>
        <input
          :id="`${id}-title`"
          ref="titleInput"
          v-model="titleDraft"
          type="text"
          class="input text-lg font-semibold"
          maxlength="200"
          @keydown.esc.stop="editingTitle = false"
          @blur="saveTitle"
        >
      </form>
      <h1
        v-else
        class="text-lg font-semibold break-words text-gray-900 sm:text-xl dark:text-gray-100"
        :class="task.status === 'cancelled' ? 'line-through opacity-70' : ''"
      >
        <button
          v-if="canEdit"
          type="button"
          class="w-full rounded text-left hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-primary-500 dark:hover:bg-gray-800"
          :title="$t('tasks.detail.editTitle')"
          @click="startTitleEdit"
        >
          {{ task.title }}
        </button>
        <template v-else>
          {{ task.title }}
        </template>
      </h1>
    </div>

    <ConflictBanner
      v-if="mutations.conflict.value"
      class="mt-3"
      :conflict="mutations.conflict.value"
      @use-theirs="resolveTheirs"
      @overwrite="resolveOverwrite"
      @dismiss="mutations.dismissConflict()"
    />

    <div class="mt-4 grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
      <!-- Properties -->
      <dl class="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm @3xl:order-2 @3xl:self-start @3xl:rounded-lg @3xl:border @3xl:border-gray-200 @3xl:p-3 @3xl:dark:border-gray-800">
        <dt class="text-xs text-gray-500 dark:text-gray-400">
          <label :for="`${id}-status`">{{ $t('tasks.fields.status') }}</label>
        </dt>
        <dd>
          <select
            v-if="canEdit"
            :id="`${id}-status`"
            class="input py-1"
            :value="task.status"
            @change="onEnumChange('status', TASK_STATUSES, $event)"
          >
            <option
              v-for="s in TASK_STATUSES"
              :key="s"
              :value="s"
            >
              {{ $t(taskStatusLabelKey(s)) }}
            </option>
          </select>
          <StatusBadge
            v-else
            :status="task.status"
          />
        </dd>

        <dt class="text-xs text-gray-500 dark:text-gray-400">
          <label :for="`${id}-priority`">{{ $t('tasks.fields.priority') }}</label>
        </dt>
        <dd>
          <select
            v-if="canEdit"
            :id="`${id}-priority`"
            class="input py-1"
            :value="task.priority"
            @change="onEnumChange('priority', TASK_PRIORITIES, $event)"
          >
            <option
              v-for="p in TASK_PRIORITIES"
              :key="p"
              :value="p"
            >
              {{ $t(taskPriorityLabelKey(p)) }}
            </option>
          </select>
          <PriorityBadge
            v-else
            :priority="task.priority"
          />
        </dd>

        <dt class="text-xs text-gray-500 dark:text-gray-400">
          <label :for="`${id}-type`">{{ $t('tasks.fields.type') }}</label>
        </dt>
        <dd>
          <select
            v-if="canEdit"
            :id="`${id}-type`"
            class="input py-1"
            :value="task.type"
            @change="onEnumChange('type', TASK_TYPES, $event)"
          >
            <option
              v-for="ty in TASK_TYPES"
              :key="ty"
              :value="ty"
            >
              {{ $t(taskTypeLabelKey(ty)) }}
            </option>
          </select>
          <TypeBadge
            v-else
            :type="task.type"
          />
        </dd>

        <dt class="text-xs text-gray-500 dark:text-gray-400">
          <label :for="`${id}-size`">{{ $t('tasks.fields.size') }}</label>
        </dt>
        <dd>
          <select
            v-if="canEdit"
            :id="`${id}-size`"
            class="input py-1"
            :value="task.size ?? ''"
            @change="onSizeChange"
          >
            <option value="">
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
          <SizeBadge
            v-else
            :size="task.size"
            show-empty
          />
        </dd>

        <dt class="text-xs text-gray-500 dark:text-gray-400">
          <label :for="`${id}-executor`">{{ $t('tasks.fields.executor') }}</label>
        </dt>
        <dd>
          <select
            v-if="canEdit"
            :id="`${id}-executor`"
            class="input py-1"
            :value="task.executor"
            @change="onEnumChange('executor', TASK_EXECUTORS, $event)"
          >
            <option
              v-for="e in TASK_EXECUTORS"
              :key="e"
              :value="e"
            >
              {{ $t(taskExecutorLabelKey(e)) }}
            </option>
          </select>
          <ExecutorBadge
            v-else
            :executor="task.executor"
          />
        </dd>

        <dt class="text-xs text-gray-500 dark:text-gray-400">
          <label :for="`${id}-assignee`">{{ $t('tasks.fields.assignee') }}</label>
        </dt>
        <dd class="space-y-1">
          <template v-if="canEdit">
            <select
              :id="`${id}-assignee`"
              class="input py-1"
              :value="assigneeKindDraft"
              @change="onAssigneeKindChange"
            >
              <option
                v-for="kind in assigneeKinds"
                :key="kind"
                :value="kind"
                :disabled="kind === 'member'"
              >
                {{ kind === 'member' && task.assignee.name ? task.assignee.name : $t(taskAssigneeLabelKey(kind)) }}
              </option>
            </select>
            <form
              v-if="assigneeKindDraft === 'external'"
              @submit.prevent="saveExternalAssignee"
            >
              <label
                :for="`${id}-external`"
                class="sr-only"
              >{{ $t('tasks.assignee.externalName') }}</label>
              <input
                :id="`${id}-external`"
                ref="externalInput"
                v-model="externalName"
                type="text"
                class="input py-1"
                maxlength="120"
                :placeholder="$t('tasks.assignee.externalPlaceholder')"
                @blur="saveExternalAssignee"
              >
            </form>
          </template>
          <AssigneeLabel
            v-else
            :assignee="task.assignee"
          />
        </dd>

        <dt class="text-xs text-gray-500 dark:text-gray-400">
          <label :for="`${id}-due`">{{ $t('tasks.fields.due') }}</label>
        </dt>
        <dd>
          <div
            v-if="canEdit"
            class="flex items-center gap-1"
          >
            <input
              :id="`${id}-due`"
              type="date"
              class="input py-1"
              :class="overdue ? 'border-red-400 text-red-600 dark:border-red-700 dark:text-red-400' : ''"
              :value="task.dueDate ?? ''"
              @change="onDueChange"
            >
            <button
              v-if="task.dueDate"
              type="button"
              class="btn-ghost p-1"
              :aria-label="$t('tasks.detail.clearDue')"
              @click="patch({ dueDate: null })"
            >
              <Icon
                name="x"
                class="size-3.5"
              />
            </button>
          </div>
          <span
            v-else-if="task.dueDate"
            :class="overdue ? 'font-medium text-red-600 dark:text-red-400' : ''"
          >{{ formatDate(task.dueDate, locale) }}</span>
          <span
            v-else
            class="text-gray-400 dark:text-gray-500"
          >{{ $t('tasks.table.noDue') }}</span>
        </dd>
      </dl>

      <!-- Main column -->
      <div class="min-w-0 space-y-6 @3xl:order-1">
        <BlockerEditor
          v-if="showBlocker"
          :blocker="task.blocker"
          :readonly="!canEdit"
          @save="patch({ blocker: $event })"
        />
        <button
          v-else-if="canEdit"
          type="button"
          class="btn-ghost -ml-2 px-2 py-1 text-xs"
          @click="forceBlocker = true"
        >
          <Icon
            name="hourglass"
            class="size-3.5"
          />
          {{ $t('tasks.blocker.add') }}
        </button>

        <section>
          <div class="mb-1 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {{ $t('tasks.fields.description') }}
            </h2>
            <button
              v-if="canEdit && !editingDescription"
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              @click="startDescriptionEdit"
            >
              <Icon
                name="pencil"
                class="size-3.5"
              />
              {{ $t('tasks.detail.edit') }}
            </button>
          </div>
          <form
            v-if="editingDescription"
            class="space-y-2"
            @submit.prevent="saveDescription"
          >
            <MarkdownEditor
              v-model="descriptionDraft"
              :rows="10"
              :placeholder="$t('tasks.detail.descriptionPlaceholder')"
            />
            <div class="flex gap-2">
              <button
                type="submit"
                class="btn-primary"
              >
                {{ $t('tasks.detail.save') }}
              </button>
              <button
                type="button"
                class="btn-ghost"
                @click="editingDescription = false"
              >
                {{ $t('tasks.detail.cancel') }}
              </button>
            </div>
          </form>
          <MarkdownView
            v-else-if="task.description.trim()"
            :source="task.description"
          />
          <p
            v-else
            class="text-sm text-gray-400 dark:text-gray-500"
          >
            {{ $t('tasks.detail.noDescription') }}
          </p>
        </section>

        <section>
          <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {{ $t('tasks.fields.checklist') }}
          </h2>
          <ChecklistEditor
            :task-ref="task.id"
            :items="task.checklist"
            :readonly="!canEdit"
            @update:items="onChecklist"
          />
        </section>

        <section>
          <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {{ $t('tasks.fields.dependencies') }}
          </h2>
          <DependencyPicker
            :task="task"
            :readonly="!canEdit"
            @updated="onDependencies"
          />
        </section>

        <section v-if="!readonly">
          <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {{ $t('tasks.comments.title') }}
            <span
              v-if="task.comments.length > 0"
              class="font-normal text-gray-400"
            >({{ task.comments.length }})</span>
          </h2>
          <CommentList
            :task-ref="task.id"
            :comments="task.comments"
            :can-comment="canComment"
            @update:comments="onComments"
          />
        </section>

        <footer class="space-y-0.5 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <p :title="formatDateTime(task.createdAt, locale)">
            {{ $t('tasks.meta.created', { who: sourceLabel(task.createdBy), when: formatRelative(task.createdAt, locale, now) }) }}
          </p>
          <p :title="formatDateTime(task.updatedAt, locale)">
            {{ $t('tasks.meta.updated', { who: sourceLabel(task.updatedBy), when: formatRelative(task.updatedAt, locale, now) }) }}
          </p>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ASSIGNEE_KINDS,
  TASK_EXECUTORS,
  TASK_PRIORITIES,
  TASK_SIZES,
  TASK_STATUSES,
  TASK_TYPES,
} from '#shared/utils/enums'
import type { AssigneeKind } from '#shared/utils/enums'
import type { ChecklistItemDto, CommentDto, TaskDetailDto } from '#shared/types/dto'
import type { TaskPatch } from '#shared/schemas/task'
import {
  isTaskOverdue,
  parseTaskSource,
  taskAssigneeLabelKey,
  taskExecutorLabelKey,
  taskPriorityLabelKey,
  taskStatusLabelKey,
  taskTypeLabelKey,
  withDerivedCounters,
} from '~/utils/taskDisplay'

const props = defineProps<{
  task: TaskDetailDto
  /** Public / read-only views: hides every editing control and the comments. */
  readonly?: boolean
}>()
const emit = defineEmits<{
  /** Any successful change (full detail). */
  updated: [task: TaskDetailDto]
  deleted: [task: TaskDetailDto]
}>()

const { t, locale } = useI18n()
const now = useNow()
const toast = useToast()
const confirm = useConfirm()
const mutations = useTaskMutations()
const id = useId()

const local = ref<TaskDetailDto | null>(props.task)
watch(() => props.task, (value) => {
  local.value = value
})
const task = computed<TaskDetailDto>(() => local.value ?? props.task)

const canEdit = computed(() => !props.readonly && (task.value.capabilities?.edit ?? false))
const canComment = computed(() => !props.readonly && (task.value.capabilities?.comment ?? false))
const canDelete = computed(() => !props.readonly && (task.value.capabilities?.manage ?? false))
const overdue = computed(() => isTaskOverdue(task.value, todayIso(now.value)))

// --- scalar edits (optimistic, 409 -> ConflictBanner) ---

async function patch(change: TaskPatch) {
  const saved = await mutations.patchTask(local, change)
  if (saved) emit('updated', saved)
}

function resolveTheirs() {
  mutations.acceptTheirs(local)
  if (local.value) emit('updated', local.value)
}

async function resolveOverwrite() {
  const saved = await mutations.overwriteMine(local)
  if (saved) emit('updated', saved)
}

function onEnumChange<K extends 'status' | 'priority' | 'type' | 'executor'>(field: K, values: readonly NonNullable<TaskPatch[K]>[], event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  const value = values.find(v => v === raw)
  if (value === undefined || value === task.value[field]) return
  void patch({ [field]: value } as TaskPatch)
}

function onSizeChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  const size = TASK_SIZES.find(s => s === raw) ?? null
  if (size !== task.value.size) void patch({ size })
}

function onDueChange(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const dueDate = raw || null
  if (dueDate !== task.value.dueDate) void patch({ dueDate })
}

// Title
const editingTitle = ref(false)
const titleDraft = ref('')
const titleInput = useTemplateRef<HTMLInputElement>('titleInput')

async function startTitleEdit() {
  titleDraft.value = task.value.title
  editingTitle.value = true
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
}

function saveTitle() {
  if (!editingTitle.value) return
  editingTitle.value = false
  const title = titleDraft.value.trim()
  if (title && title !== task.value.title) void patch({ title })
}

// Assignee
const assigneeKinds = computed<AssigneeKind[]>(() =>
  ASSIGNEE_KINDS.filter(kind => kind !== 'member' || task.value.assignee.kind === 'member'))
const assigneeKindDraft = ref<AssigneeKind>(props.task.assignee.kind)
const externalName = ref(props.task.assignee.kind === 'external' ? (props.task.assignee.name ?? '') : '')
const externalInput = useTemplateRef<HTMLInputElement>('externalInput')

watch(() => task.value.assignee, (assignee) => {
  assigneeKindDraft.value = assignee.kind
  externalName.value = assignee.kind === 'external' ? (assignee.name ?? '') : ''
})

async function onAssigneeKindChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  const kind = ASSIGNEE_KINDS.find(k => k === raw)
  if (!kind || kind === 'member') return
  assigneeKindDraft.value = kind
  if (kind === 'external') {
    await nextTick()
    externalInput.value?.focus()
    return
  }
  if (kind !== task.value.assignee.kind) void patch({ assignee: { kind } })
}

function saveExternalAssignee() {
  const name = externalName.value.trim()
  if (!name) return
  const current = task.value.assignee
  if (current.kind === 'external' && current.name === name) return
  void patch({ assignee: { kind: 'external', name } })
}

// Blocker
const forceBlocker = ref(false)
const showBlocker = computed(() => task.value.status === 'blocked' || task.value.blocker !== null || forceBlocker.value)
// Description
const editingDescription = ref(false)
const descriptionDraft = ref('')

function startDescriptionEdit() {
  descriptionDraft.value = task.value.description
  editingDescription.value = true
}

async function saveDescription() {
  editingDescription.value = false
  if (descriptionDraft.value !== task.value.description) await patch({ description: descriptionDraft.value })
}

// Another task shown in the same component instance (drawer): reset the local editing state.
watch(() => task.value.id, () => {
  forceBlocker.value = false
  editingDescription.value = false
  editingTitle.value = false
  mutations.dismissConflict()
})

// --- collections (no version bump) ---

function commitLocal(next: TaskDetailDto) {
  local.value = withDerivedCounters(next)
  emit('updated', local.value)
}

function onChecklist(items: ChecklistItemDto[]) {
  commitLocal({ ...task.value, checklist: items })
}

function onDependencies(change: Pick<TaskDetailDto, 'blockedBy' | 'blocking' | 'hiddenDependencies'>) {
  commitLocal({ ...task.value, ...change })
}

function onComments(comments: CommentDto[]) {
  commitLocal({ ...task.value, comments })
}

// --- misc ---

const session = useUserSession()
const sessionUser = computed(() => (props.readonly ? null : toSessionUser(session.user.value)))

function sourceLabel(source: string): string {
  const parsed = parseTaskSource(source)
  if (parsed.kind === 'mcp') return t('tasks.meta.claude', { name: parsed.name })
  if (parsed.kind === 'user') {
    if (sessionUser.value?.id && sessionUser.value.id === parsed.name) return t('tasks.meta.you')
    const fromComment = task.value.comments.find(c => c.authorSource === source && c.author.login)
    if (fromComment?.author.login) return fromComment.author.login
  }
  return t('tasks.meta.user')
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(task.value.key)
    toast.info(t('tasks.detail.copied'))
  }
  catch {
    // Clipboard unavailable: nothing to do.
  }
}

async function removeTask() {
  const current = task.value
  const ok = await confirm.ask({
    title: t('tasks.detail.deleteConfirmTitle'),
    message: t('tasks.detail.deleteConfirmMessage', { key: current.key }),
    confirmLabel: t('tasks.detail.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await mutations.deleteTask(current.id)
    toast.success(t('tasks.detail.deleted', { key: current.key }))
    emit('deleted', current)
  }
  catch (err) {
    mutations.reportError(err)
  }
}
</script>
