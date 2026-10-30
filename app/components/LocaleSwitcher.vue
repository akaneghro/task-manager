<template>
  <label class="relative inline-flex items-center">
    <span class="sr-only">{{ $t('locale.label') }}</span>
    <Icon
      name="globe"
      class="pointer-events-none absolute left-2 size-4 text-gray-500 dark:text-gray-400"
    />
    <select
      :value="locale"
      class="cursor-pointer appearance-none rounded-md border border-transparent bg-transparent py-1.5 pr-2 pl-7 text-sm text-gray-600 hover:bg-gray-100 focus:border-primary-500 focus:outline-none dark:text-gray-300 dark:hover:bg-gray-800"
      :class="compact ? 'w-16' : ''"
      @change="onChange"
    >
      <option
        v-for="option in options"
        :key="option.code"
        :value="option.code"
        class="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100"
      >
        {{ compact ? option.code.toUpperCase() : option.name }}
      </option>
    </select>
  </label>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: true })

const { locale, locales, setLocale } = useI18n()

const options = computed(() => locales.value.map(l => (typeof l === 'string' ? { code: l, name: l } : { code: l.code, name: l.name ?? l.code })))

async function onChange(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const next = options.value.find(o => o.code === target.value)
  if (next) await setLocale(next.code)
}
</script>
