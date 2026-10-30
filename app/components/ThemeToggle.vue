<template>
  <button
    type="button"
    class="btn-ghost p-2"
    :title="colorMode.value === 'dark' ? $t('theme.light') : $t('theme.dark')"
    :aria-label="colorMode.value === 'dark' ? $t('theme.light') : $t('theme.dark')"
    @click="colorMode.toggle"
  >
    <Icon
      :name="colorMode.value === 'dark' ? 'sun' : 'moon'"
      class="size-5"
      :class="colorMode.value === 'dark' ? 'text-yellow-500' : 'text-gray-600'"
    />
  </button>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
</script>
