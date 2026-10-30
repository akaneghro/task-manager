<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
    role="region"
    :aria-label="$t('toasts.region')"
  >
    <div
      aria-live="polite"
      class="flex w-full flex-col items-center gap-2 sm:items-end"
    >
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :role="toast.kind === 'error' ? 'alert' : 'status'"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg"
          :class="styles[toast.kind]"
        >
          <Icon
            :name="icons[toast.kind]"
            class="mt-0.5 size-4 shrink-0"
          />
          <p class="min-w-0 flex-1 break-words">
            {{ toast.message }}
          </p>
          <button
            type="button"
            class="-m-1 rounded p-1 opacity-70 hover:opacity-100 focus-visible:outline-2"
            :aria-label="$t('toasts.dismiss')"
            @click="dismiss(toast.id)"
          >
            <Icon
              name="x"
              class="size-3.5"
            />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ToastKind } from '~/composables/useToast'
import type { IconName } from './Icon.vue'

const { toasts, dismiss } = useToast()

const styles: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
  info: 'border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
}
const icons: Record<ToastKind, IconName> = { success: 'check', error: 'alert', info: 'sparkles' }
</script>
