<template>
  <AppModal
    :open="request !== null"
    :title="request?.title || $t('confirm.defaultTitle')"
    size="sm"
    role="alertdialog"
    @update:open="onOpenChange"
  >
    <p
      v-if="request?.message"
      class="text-sm whitespace-pre-line text-gray-600 dark:text-gray-300"
    >
      {{ request.message }}
    </p>
    <template #footer>
      <button
        type="button"
        class="btn-secondary"
        @click="dialog.cancel()"
      >
        {{ request?.cancelLabel || $t('ui.cancel') }}
      </button>
      <button
        type="button"
        autofocus
        :class="request?.danger ? 'btn-danger' : 'btn-primary'"
        @click="dialog.confirm()"
      >
        {{ request?.confirmLabel || $t('ui.confirm') }}
      </button>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
const dialog = useConfirm()
const request = computed(() => dialog.current.value)

function onOpenChange(value: boolean) {
  if (!value) dialog.cancel()
}
</script>
