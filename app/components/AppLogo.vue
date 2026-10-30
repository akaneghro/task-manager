<template>
  <span class="inline-flex items-center gap-2">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      :width="size"
      :height="size"
      class="shrink-0"
      :aria-hidden="withText ? 'true' : undefined"
      :role="withText ? undefined : 'img'"
      :aria-label="withText ? undefined : 'Task Manager'"
      focusable="false"
    >
      <defs>
        <linearGradient
          :id="gradientId"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0"
            stop-color="#38bdf8"
          />
          <stop
            offset="1"
            stop-color="#0369a1"
          />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        :fill="`url(#${gradientId})`"
      />
      <rect
        x="6.5"
        y="7"
        width="5"
        height="18"
        rx="2"
        fill="#fff"
        fill-opacity=".95"
      />
      <rect
        x="13.5"
        y="7"
        width="5"
        height="12"
        rx="2"
        fill="#fff"
        fill-opacity=".6"
      />
      <path
        d="M20.25 14.75l2.4 2.4 4.1-4.75"
        fill="none"
        stroke="#fff"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <span
      v-if="withText"
      class="font-bold tracking-tight whitespace-nowrap"
      :style="{ fontSize: `${Math.round(size * 0.6)}px` }"
    >
      <span class="text-gray-900 dark:text-gray-50">Task</span>
      <span class="text-primary-600 dark:text-primary-400"> Manager</span>
    </span>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  /** Mark size in px. */
  size?: number
  /** Show the "Task Manager" wordmark next to the mark. */
  withText?: boolean
}>(), { size: 28, withText: false })

const gradientId = `tm-logo-${useId()}`
</script>
