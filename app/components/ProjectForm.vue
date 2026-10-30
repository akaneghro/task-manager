<template>
  <form
    class="space-y-4"
    novalidate
    @submit.prevent="submit"
  >
    <div
      v-if="formError"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {{ formError }}
    </div>

    <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
      <div>
        <label
          :for="`${uid}-name`"
          class="label"
        >{{ $t('projectForm.name') }}</label>
        <input
          :id="`${uid}-name`"
          v-model="form.name"
          type="text"
          class="input"
          maxlength="120"
          required
          autofocus
          :aria-invalid="!!errors.name"
          @input="onNameInput"
        >
        <p
          v-if="errors.name"
          class="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          {{ errors.name }}
        </p>
      </div>
      <div>
        <label
          :for="`${uid}-key`"
          class="label"
        >{{ $t('projectForm.key') }}</label>
        <input
          :id="`${uid}-key`"
          v-model="form.key"
          type="text"
          class="input font-mono uppercase"
          maxlength="6"
          :disabled="isEdit"
          :aria-describedby="`${uid}-key-hint`"
          :aria-invalid="!!errors.key"
          @input="keyTouched = true"
        >
      </div>
    </div>
    <p
      :id="`${uid}-key-hint`"
      class="-mt-2 text-xs"
      :class="errors.key ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'"
    >
      {{ errors.key || $t('projectForm.keyHint') }}
    </p>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label
          :for="`${uid}-slug`"
          class="label"
        >{{ $t('projectForm.slug') }}</label>
        <input
          :id="`${uid}-slug`"
          v-model="form.slug"
          type="text"
          class="input font-mono"
          maxlength="60"
          :disabled="isInbox"
          :placeholder="slugPlaceholder"
          :aria-describedby="`${uid}-slug-hint`"
          :aria-invalid="!!errors.slug"
        >
        <p
          :id="`${uid}-slug-hint`"
          class="mt-1 text-xs"
          :class="errors.slug ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'"
        >
          {{ errors.slug || (isInbox ? $t('projectForm.inboxLocked') : $t('projectForm.slugHint')) }}
        </p>
      </div>
      <div>
        <label
          :for="`${uid}-status`"
          class="label"
        >{{ $t('projectForm.status') }}</label>
        <select
          :id="`${uid}-status`"
          v-model="form.status"
          class="input"
        >
          <option
            v-for="status in statusOptions"
            :key="status"
            :value="status"
          >
            {{ $t(`projectStatus.${status}`) }}
          </option>
        </select>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
      <div>
        <label
          :for="`${uid}-client`"
          class="label"
        >{{ $t('projectForm.client') }} <span class="font-normal opacity-70">({{ $t('ui.optional') }})</span></label>
        <input
          :id="`${uid}-client`"
          v-model="form.client"
          type="text"
          class="input"
          maxlength="120"
        >
      </div>
      <fieldset>
        <legend class="label">
          {{ $t('projectForm.color') }}
        </legend>
        <div class="flex items-center gap-1.5">
          <button
            v-for="swatch in SWATCHES"
            :key="swatch"
            type="button"
            class="size-6 rounded-md border-2 focus-visible:outline-2 focus-visible:outline-primary-500"
            :class="form.color === swatch ? 'border-gray-900 dark:border-white' : 'border-transparent'"
            :style="{ backgroundColor: swatch }"
            :aria-label="swatch"
            :aria-pressed="form.color === swatch"
            @click="form.color = swatch"
          />
          <button
            type="button"
            class="flex size-6 items-center justify-center rounded-md border-2 text-gray-400"
            :class="form.color === null ? 'border-gray-900 dark:border-white' : 'border-gray-200 dark:border-gray-700'"
            :aria-label="$t('projectForm.noColor')"
            :aria-pressed="form.color === null"
            @click="form.color = null"
          >
            <Icon
              name="ban"
              class="size-3.5"
            />
          </button>
        </div>
      </fieldset>
    </div>

    <div>
      <label
        :for="`${uid}-description`"
        class="label"
      >{{ $t('projectForm.description') }}</label>
      <textarea
        :id="`${uid}-description`"
        v-model="form.description"
        rows="3"
        class="input resize-y"
        maxlength="5000"
        :placeholder="$t('projectForm.descriptionPlaceholder')"
      />
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <button
        v-if="cancelable"
        type="button"
        class="btn-secondary"
        @click="emit('cancel')"
      >
        {{ $t('ui.cancel') }}
      </button>
      <button
        type="submit"
        class="btn-primary"
        :disabled="saving"
      >
        {{ saving ? $t('ui.saving') : (isEdit ? $t('ui.save') : $t('ui.create')) }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { createProjectSchema, updateProjectSchema } from '#shared/schemas/project'
import type { ProjectDetailDto } from '#shared/types/dto'
import { PROJECT_STATUSES, type ProjectStatus } from '#shared/utils/enums'

const props = withDefaults(defineProps<{
  /** Edit mode when present; create mode otherwise. */
  project?: ProjectDetailDto | null
  cancelable?: boolean
}>(), { project: null, cancelable: true })

const emit = defineEmits<{
  saved: [project: ProjectDetailDto]
  cancel: []
  /** Emitted after a 409 with the current server version (already loaded into the form). */
  conflict: [current: ProjectDetailDto | null]
}>()

const SWATCHES = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6'] as const

const { t } = useI18n()
const toast = useToast()
const apiError = useApiError()
const uid = useId()

interface FormState {
  name: string
  key: string
  slug: string
  status: ProjectStatus
  client: string
  color: string | null
  description: string
}

const isEdit = computed(() => props.project !== null)
const isInbox = computed(() => props.project?.isInbox === true)
const statusOptions = computed(() => (isInbox.value ? PROJECT_STATUSES.filter(s => s !== 'archived') : PROJECT_STATUSES))

function fromProject(p: ProjectDetailDto | null): FormState {
  return {
    name: p?.name ?? '',
    key: p?.key ?? '',
    slug: p?.slug ?? '',
    status: p?.status ?? 'idea',
    client: p?.client ?? '',
    color: p?.color ?? null,
    description: p?.description ?? '',
  }
}

const form = reactive<FormState>(fromProject(props.project))
const version = ref(props.project?.version ?? 0)
const keyTouched = ref(isEdit.value)
const saving = ref(false)
const formError = ref<string | null>(null)
const errors = reactive<Partial<Record<'name' | 'key' | 'slug', string>>>({})

watch(() => props.project, (p) => {
  if (!p) return
  Object.assign(form, fromProject(p))
  version.value = p.version
})

const slugPlaceholder = computed(() => slugify(form.name || 'my-project'))

function onNameInput() {
  if (!isEdit.value && !keyTouched.value) form.key = suggestProjectKey(form.name)
}

function collectErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>, message: string }>) {
  for (const issue of issues) {
    const field = issue.path[0]
    if ((field === 'name' || field === 'key' || field === 'slug') && !errors[field]) errors[field] = issue.message
  }
}

async function submit() {
  formError.value = null
  errors.name = undefined
  errors.key = undefined
  errors.slug = undefined

  const common = {
    name: form.name,
    status: form.status,
    description: form.description,
    client: form.client.trim() ? form.client.trim() : null,
    color: form.color,
  }

  saving.value = true
  try {
    let saved: ProjectDetailDto
    if (props.project) {
      const body = {
        ...common,
        expectedVersion: version.value,
        ...(isInbox.value || form.slug === props.project.slug ? {} : { slug: form.slug }),
      }
      const parsed = updateProjectSchema.safeParse(body)
      if (!parsed.success) {
        collectErrors(parsed.error.issues)
        return
      }
      saved = await apiFetch<ProjectDetailDto>(`/api/projects/${encodeURIComponent(props.project.slug)}`, { method: 'PATCH', body })
      toast.success(t('projectForm.saved'))
    }
    else {
      const body = { ...common, key: form.key, ...(form.slug.trim() ? { slug: form.slug } : {}) }
      const parsed = createProjectSchema.safeParse(body)
      if (!parsed.success) {
        collectErrors(parsed.error.issues)
        return
      }
      saved = await apiFetch<ProjectDetailDto>('/api/projects', { method: 'POST', body })
      toast.success(t('projects.created'))
    }
    useProjectsStore().upsert(saved)
    emit('saved', saved)
  }
  catch (err) {
    if (apiError.isConflict(err)) {
      const current = apiError.details(err)
      const currentProject = isProjectDetail(current) ? current : null
      if (currentProject) {
        Object.assign(form, fromProject(currentProject))
        version.value = currentProject.version
      }
      formError.value = t('projectForm.conflict')
      emit('conflict', currentProject)
    }
    else {
      formError.value = apiError.message(err)
    }
  }
  finally {
    saving.value = false
  }
}

function isProjectDetail(value: unknown): value is ProjectDetailDto {
  return typeof value === 'object' && value !== null && 'slug' in value && 'version' in value && 'notes' in value
}
</script>
