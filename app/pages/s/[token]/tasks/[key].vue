<template>
  <div class="mx-auto max-w-4xl">
    <NuxtLink
      :to="`/s/${encodeURIComponent(token)}`"
      class="btn-ghost mb-4 -ml-2"
    >
      <Icon
        name="arrow-left"
        class="size-4"
      />
      {{ $t('public.backToProject') }}
    </NuxtLink>

    <EmptyState
      v-if="error"
      icon="ban"
      :title="$t('public.notFound')"
      :description="apiError.status(error) === 404 ? $t('public.notFoundHint') : apiError.message(error)"
    />
    <p
      v-else-if="!task"
      class="text-sm text-gray-500"
    >
      {{ $t('ui.loading') }}
    </p>
    <div
      v-else
      class="card p-4 sm:p-6"
    >
      <TaskDetail
        :task="task"
        readonly
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskDetailDto } from '#shared/types/dto'

definePageMeta({ layout: 'public' })

const route = useRoute()
const apiError = useApiError()
const token = computed(() => String(route.params.token))
const key = computed(() => String(route.params.key))

const { data: task, error } = await useFetch<TaskDetailDto>(
  () => `/api/public/${encodeURIComponent(token.value)}/tasks/${encodeURIComponent(key.value)}`,
  { key: computed(() => `tm:public:${token.value}:${key.value}`) },
)

// Unknown or revoked links render an in-page message; still answer with the real HTTP status (404).
const requestEvent = useRequestEvent()
if (import.meta.server && requestEvent && error.value) setResponseStatus(requestEvent, error.value.statusCode || 404)

useHead({ title: () => (task.value ? `${task.value.key} ${task.value.title} · Task Manager` : 'Task Manager') })
useSeoMeta({ robots: 'noindex, nofollow' })
</script>
