<template>
  <div class="rounded-md border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/30">
    <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
      <Icon
        name="hourglass"
        class="size-3.5"
      />
      {{ $t('tasks.blocker.title') }}
    </div>

    <template v-if="readonly || !editing">
      <div
        v-if="blocker"
        class="text-sm text-gray-800 dark:text-gray-200"
      >
        <p class="font-medium">
          {{ $t('tasks.blocker.waitingOn', { who: blocker.who }) }}
          <span
            v-if="blocker.since"
            class="font-normal text-gray-500 dark:text-gray-400"
          >· {{ $t('tasks.blocker.since') }} {{ formatDate(blocker.since, locale) }}</span>
        </p>
        <p class="mt-0.5 whitespace-pre-line text-gray-700 dark:text-gray-300">
          {{ blocker.what }}
        </p>
      </div>
      <p
        v-else
        class="text-sm text-gray-500 dark:text-gray-400"
      >
        {{ $t('tasks.blocker.none') }}
      </p>
      <div
        v-if="!readonly"
        class="mt-2 flex gap-2"
      >
        <button
          type="button"
          class="btn-secondary px-2 py-1 text-xs"
          @click="startEdit"
        >
          <Icon
            :name="blocker ? 'pencil' : 'plus'"
            class="size-3.5"
          />
          {{ blocker ? $t('tasks.detail.edit') : $t('tasks.blocker.add') }}
        </button>
        <button
          v-if="blocker"
          type="button"
          class="btn-ghost px-2 py-1 text-xs text-red-700 dark:text-red-300"
          @click="emit('save', null)"
        >
          {{ $t('tasks.blocker.remove') }}
        </button>
      </div>
    </template>

    <form
      v-else
      class="space-y-2"
      @submit.prevent="save"
    >
      <div class="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <div>
          <label
            :for="`${id}-who`"
            class="label"
          >{{ $t('tasks.blocker.who') }}</label>
          <input
            :id="`${id}-who`"
            ref="whoInput"
            v-model="who"
            type="text"
            class="input"
            maxlength="120"
            required
            :placeholder="$t('tasks.blocker.whoPlaceholder')"
          >
        </div>
        <div>
          <label
            :for="`${id}-since`"
            class="label"
          >{{ $t('tasks.blocker.since') }}</label>
          <input
            :id="`${id}-since`"
            v-model="since"
            type="date"
            class="input"
          >
        </div>
      </div>
      <div>
        <label
          :for="`${id}-what`"
          class="label"
        >{{ $t('tasks.blocker.what') }}</label>
        <textarea
          :id="`${id}-what`"
          v-model="what"
          class="input"
          rows="2"
          maxlength="500"
          required
          :placeholder="$t('tasks.blocker.whatPlaceholder')"
        />
      </div>
      <div class="flex gap-2">
        <button
          type="submit"
          class="btn-primary px-2 py-1 text-xs"
          :disabled="!who.trim() || !what.trim()"
        >
          {{ $t('tasks.blocker.save') }}
        </button>
        <button
          type="button"
          class="btn-ghost px-2 py-1 text-xs"
          @click="cancel"
        >
          {{ $t('tasks.detail.cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { BlockerDto } from '#shared/types/dto'
import type { BlockerInput } from '#shared/schemas/task'

const props = defineProps<{
  blocker: BlockerDto | null
  readonly?: boolean
}>()
const emit = defineEmits<{
  save: [blocker: BlockerInput | null]
  /** The form was closed without saving. */
  cancel: []
}>()

const { locale } = useI18n()
const id = useId()
const editing = ref(false)
const who = ref('')
const what = ref('')
const since = ref('')
const whoInput = useTemplateRef<HTMLInputElement>('whoInput')

async function startEdit() {
  who.value = props.blocker?.who ?? ''
  what.value = props.blocker?.what ?? ''
  since.value = props.blocker?.since ?? todayIso()
  editing.value = true
  await nextTick()
  whoInput.value?.focus()
}

function save() {
  const input: BlockerInput = { who: who.value.trim(), what: what.value.trim() }
  if (!input.who || !input.what) return
  if (since.value) input.since = since.value
  editing.value = false
  emit('save', input)
}

function cancel() {
  editing.value = false
  emit('cancel')
}

defineExpose({ startEdit })
</script>
