<template>
  <!-- html comes only from renderMarkdown() (sanitized, see app/utils/markdown.ts) -->
  <div
    class="tm-markdown prose prose-sm max-w-none break-words dark:prose-invert prose-a:text-primary-600 prose-pre:bg-gray-100 prose-pre:text-gray-800 dark:prose-a:text-primary-400 dark:prose-pre:bg-gray-800 dark:prose-pre:text-gray-100"
    v-html="html"
  />
</template>

<script setup lang="ts">
const props = defineProps<{ source: string | null | undefined }>()

const html = computed(() => renderMarkdown(props.source))
</script>

<style scoped>
.tm-markdown :deep(ul.contains-task-list) {
  list-style: none;
  padding-left: 0.25rem;
}
.tm-markdown :deep(li.task-list-item > input[type='checkbox']) {
  margin: 0 0.4rem 0 0;
  vertical-align: middle;
}
</style>
