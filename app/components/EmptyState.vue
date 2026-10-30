<template>
  <div class="flex flex-col items-center justify-center px-4 py-12 text-center">
    <div
      v-if="icon"
      class="mb-3 flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
    >
      <Icon
        :name="icon"
        class="size-6"
      />
    </div>
    <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
      {{ title }}
    </p>
    <p
      v-if="description"
      class="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.default"
      class="mt-4 flex flex-wrap items-center justify-center gap-2"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IconName } from './Icon.vue'

defineProps<{
  icon?: IconName
  title: string
  description?: string
}>()
</script>
