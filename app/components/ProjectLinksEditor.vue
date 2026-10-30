<template>
  <div class="space-y-3">
    <p
      v-if="rows.length === 0"
      class="text-sm text-gray-500 dark:text-gray-400"
    >
      {{ $t('links.empty') }}
    </p>
    <ul
      v-else
      class="space-y-2"
    >
      <li
        v-for="(row, index) in rows"
        :key="row.uid"
        class="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[8.5rem_10rem_1fr_auto]"
      >
        <div class="col-span-2 sm:col-span-1">
          <label
            :for="`${row.uid}-kind`"
            class="sr-only"
          >{{ $t('links.kind') }}</label>
          <select
            :id="`${row.uid}-kind`"
            v-model="row.kind"
            class="input"
          >
            <option
              v-for="kind in PROJECT_LINK_KINDS"
              :key="kind"
              :value="kind"
            >
              {{ $t(`linkKind.${kind}`) }}
            </option>
          </select>
        </div>
        <div class="col-span-2 sm:col-span-1">
          <label
            :for="`${row.uid}-label`"
            class="sr-only"
          >{{ $t('links.label') }}</label>
          <input
            :id="`${row.uid}-label`"
            v-model="row.label"
            type="text"
            class="input"
            maxlength="80"
            :placeholder="$t('links.label')"
          >
        </div>
        <div>
          <label
            :for="`${row.uid}-url`"
            class="sr-only"
          >{{ $t('links.url') }}</label>
          <input
            :id="`${row.uid}-url`"
            v-model="row.url"
            type="url"
            class="input font-mono"
            maxlength="2000"
            placeholder="https://"
          >
        </div>
        <div class="flex items-center">
          <button
            type="button"
            class="btn-ghost p-1.5"
            :disabled="index === 0"
            :aria-label="$t('ui.moveUp')"
            @click="move(index, -1)"
          >
            <Icon
              name="chevron-up"
              class="size-4"
            />
          </button>
          <button
            type="button"
            class="btn-ghost p-1.5"
            :disabled="index === rows.length - 1"
            :aria-label="$t('ui.moveDown')"
            @click="move(index, 1)"
          >
            <Icon
              name="chevron-down"
              class="size-4"
            />
          </button>
          <button
            type="button"
            class="btn-ghost p-1.5 text-red-600 dark:text-red-400"
            :aria-label="$t('ui.remove')"
            @click="rows.splice(index, 1)"
          >
            <Icon
              name="trash"
              class="size-4"
            />
          </button>
        </div>
      </li>
    </ul>

    <p
      v-if="error"
      role="alert"
      class="text-sm text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>

    <div class="flex flex-wrap justify-between gap-2">
      <button
        type="button"
        class="btn-secondary"
        :disabled="rows.length >= 30"
        @click="addRow"
      >
        <Icon
          name="plus"
          class="size-4"
        />
        {{ $t('links.add') }}
      </button>
      <button
        type="button"
        class="btn-primary"
        :disabled="saving || !dirty"
        @click="save"
      >
        {{ saving ? $t('ui.saving') : $t('links.save') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { replaceProjectLinksSchema } from '#shared/schemas/project'
import type { ProjectLinkDto } from '#shared/types/dto'
import { PROJECT_LINK_KINDS, type ProjectLinkKind } from '#shared/utils/enums'

const props = defineProps<{
  slug: string
  links: ProjectLinkDto[]
}>()

const emit = defineEmits<{ saved: [links: ProjectLinkDto[]] }>()

interface Row {
  uid: string
  kind: ProjectLinkKind
  label: string
  url: string
}

const { t } = useI18n()
const toast = useToast()
const apiError = useApiError()

let counter = 0
const nextUid = () => `link-${++counter}`

function toRows(links: readonly ProjectLinkDto[]): Row[] {
  return [...links].sort((a, b) => a.position - b.position).map(l => ({ uid: nextUid(), kind: l.kind, label: l.label, url: l.url }))
}

const rows = ref<Row[]>(toRows(props.links))
const saving = ref(false)
const error = ref<string | null>(null)

watch(() => props.links, (links) => {
  rows.value = toRows(links)
})

const serialized = (list: ReadonlyArray<{ kind: string, label: string, url: string }>) => JSON.stringify(list.map(l => [l.kind, l.label.trim(), l.url.trim()]))
const dirty = computed(() => serialized(rows.value) !== serialized([...props.links].sort((a, b) => a.position - b.position)))

function addRow() {
  rows.value.push({ uid: nextUid(), kind: 'other', label: '', url: '' })
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= rows.value.length) return
  const copy = [...rows.value]
  const [item] = copy.splice(index, 1)
  if (item) copy.splice(target, 0, item)
  rows.value = copy
}

async function save() {
  error.value = null
  const body = { links: rows.value.map(r => ({ kind: r.kind, label: r.label.trim(), url: r.url.trim() })) }
  if (!replaceProjectLinksSchema.safeParse(body).success) {
    error.value = t('links.invalid')
    return
  }
  saving.value = true
  try {
    const saved = await apiFetch<ProjectLinkDto[]>(`/api/projects/${encodeURIComponent(props.slug)}/links`, { method: 'PUT', body })
    toast.success(t('links.saved'))
    emit('saved', saved)
  }
  catch (err) {
    error.value = apiError.message(err)
  }
  finally {
    saving.value = false
  }
}
</script>
