<template>
  <Teleport to="#teleports">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
        @mousedown.self="close"
      >
        <div
          ref="panel"
          :role="role"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="card flex max-h-[92vh] w-full flex-col rounded-b-none shadow-xl outline-none sm:rounded-b-lg"
          :class="widthClass"
          @keydown.esc.stop="close"
        >
          <header class="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h2
              :id="titleId"
              class="text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ title }}
            </h2>
            <button
              type="button"
              class="btn-ghost p-1.5"
              :aria-label="$t('ui.close')"
              @click="close"
            >
              <Icon
                name="x"
                class="size-4"
              />
            </button>
          </header>
          <div class="overflow-y-auto px-4 py-4">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// Minimal accessible modal (bottom sheet on mobile). v-model:open controls visibility.
const props = withDefaults(defineProps<{
  title: string
  size?: 'sm' | 'md' | 'lg'
  role?: 'dialog' | 'alertdialog'
}>(), { size: 'md', role: 'dialog' })

const open = defineModel<boolean>('open', { default: false })

const titleId = useId()
const panel = useTemplateRef<HTMLElement>('panel')
let previousFocus: HTMLElement | null = null

const widthClass = computed(() => ({ sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' })[props.size])

function close() {
  open.value = false
}

watch(open, async (value) => {
  if (!import.meta.client) return
  if (value) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const autofocus = panel.value?.querySelector<HTMLElement>('[autofocus], input, select, textarea')
    ;(autofocus ?? panel.value)?.focus()
  }
  else {
    previousFocus?.focus()
    previousFocus = null
  }
})
</script>
