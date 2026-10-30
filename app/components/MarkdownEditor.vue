<template>
  <div class="rounded-md border border-gray-300 bg-white focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:border-gray-700 dark:bg-gray-900">
    <div
      class="flex items-center gap-1 border-b border-gray-200 px-1.5 pt-1.5 dark:border-gray-800"
      role="tablist"
    >
      <button
        v-for="tab in tabs"
        :id="`${uid}-tab-${tab}`"
        :key="tab"
        type="button"
        role="tab"
        :aria-selected="mode === tab"
        :aria-controls="`${uid}-panel`"
        :tabindex="mode === tab ? 0 : -1"
        class="-mb-px rounded-t-md border border-b-0 px-3 py-1 text-xs font-medium"
        :class="mode === tab
          ? 'border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100'
          : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="mode = tab"
        @keydown.left.prevent="mode = 'write'"
        @keydown.right.prevent="mode = 'preview'"
      >
        {{ $t(`markdown.${tab}`) }}
      </button>
      <span class="ml-auto pr-1 text-[11px] text-gray-400 dark:text-gray-500">{{ $t('markdown.hint') }}</span>
    </div>
    <div
      :id="`${uid}-panel`"
      role="tabpanel"
      :aria-labelledby="`${uid}-tab-${mode}`"
    >
      <textarea
        v-if="mode === 'write'"
        :id="id"
        v-model="model"
        :rows="rows"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        :disabled="disabled"
        class="block w-full resize-y rounded-b-md border-0 bg-transparent px-2.5 py-2 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 focus:outline-none dark:text-gray-100"
        @keydown.meta.enter="emit('submit')"
        @keydown.ctrl.enter="emit('submit')"
      />
      <div
        v-else
        class="px-3 py-2"
        :style="{ minHeight: `${rows * 1.5}rem` }"
      >
        <MarkdownView
          v-if="model.trim()"
          :source="model"
        />
        <p
          v-else
          class="text-sm text-gray-400 dark:text-gray-500"
        >
          {{ $t('markdown.empty') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  rows?: number
  placeholder?: string
  /** id of the textarea, for an external <label for>. */
  id?: string
  ariaLabel?: string
  disabled?: boolean
}>(), { rows: 8, placeholder: '', id: undefined, ariaLabel: undefined, disabled: false })

const emit = defineEmits<{ submit: [] }>()

const model = defineModel<string>({ default: '' })

const tabs = ['write', 'preview'] as const
const mode = ref<(typeof tabs)[number]>('write')
const uid = useId()
</script>
