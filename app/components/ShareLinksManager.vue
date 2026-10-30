<template>
  <div class="space-y-4">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      {{ $t('shareLinks.description') }}
    </p>

    <form
      class="flex flex-col gap-2 sm:flex-row sm:items-end"
      @submit.prevent="create"
    >
      <div class="flex-1">
        <label
          :for="`${uid}-label`"
          class="label"
        >{{ $t('shareLinks.label') }} <span class="font-normal opacity-70">({{ $t('ui.optional') }})</span></label>
        <input
          :id="`${uid}-label`"
          v-model="label"
          type="text"
          class="input"
          maxlength="80"
          :placeholder="$t('shareLinks.labelPlaceholder')"
        >
      </div>
      <button
        type="submit"
        class="btn-primary"
        :disabled="creating"
      >
        <Icon
          name="link"
          class="size-4"
        />
        {{ $t('shareLinks.create') }}
      </button>
    </form>

    <p
      v-if="error"
      class="text-sm text-red-600 dark:text-red-400"
    >
      {{ apiError.message(error) }}
    </p>
    <p
      v-else-if="pending && !links"
      class="text-sm text-gray-500"
    >
      {{ $t('ui.loading') }}
    </p>
    <p
      v-else-if="!links || links.length === 0"
      class="text-sm text-gray-500 dark:text-gray-400"
    >
      {{ $t('shareLinks.empty') }}
    </p>
    <ul
      v-else
      class="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800"
    >
      <li
        v-for="link in links"
        :key="link.id"
        class="flex flex-wrap items-center gap-2 px-3 py-2"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ link.label || $t('shareLinks.untitled') }}
          </p>
          <p class="truncate font-mono text-xs text-gray-500 dark:text-gray-400">
            {{ link.url }}
          </p>
          <p class="text-xs text-gray-400 dark:text-gray-500">
            {{ link.lastUsedAt ? $t('shareLinks.lastUsed', { when: formatRelative(link.lastUsedAt, locale, now) }) : $t('shareLinks.neverUsed') }}
          </p>
        </div>
        <button
          type="button"
          class="btn-ghost p-1.5"
          :aria-label="$t('shareLinks.copy')"
          :title="$t('shareLinks.copy')"
          @click="copy(link.url)"
        >
          <Icon
            name="copy"
            class="size-4"
          />
        </button>
        <a
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="btn-ghost p-1.5"
          :aria-label="$t('shareLinks.open')"
          :title="$t('shareLinks.open')"
        >
          <Icon
            name="external"
            class="size-4"
          />
        </a>
        <button
          type="button"
          class="btn-ghost p-1.5 text-red-600 dark:text-red-400"
          :aria-label="$t('shareLinks.revoke')"
          :title="$t('shareLinks.revoke')"
          @click="revoke(link)"
        >
          <Icon
            name="trash"
            class="size-4"
          />
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { ShareLinkDto } from '#shared/types/dto'

const props = defineProps<{ slug: string }>()

const { t, locale } = useI18n()
const now = useNow()
const toast = useToast()
const apiError = useApiError()
const { ask } = useConfirm()
const { copy } = useCopy()
const uid = useId()

const { data: links, pending, error, refresh } = useFetch<ShareLinkDto[]>(
  () => `/api/projects/${encodeURIComponent(props.slug)}/share-links`,
  { key: computed(() => `tm:share-links:${props.slug}`) },
)

const label = ref('')
const creating = ref(false)

async function create() {
  creating.value = true
  try {
    const created = await apiFetch<ShareLinkDto>(`/api/projects/${encodeURIComponent(props.slug)}/share-links`, {
      method: 'POST',
      body: { label: label.value.trim() || null },
    })
    label.value = ''
    toast.success(t('shareLinks.created'))
    await refresh()
    await copy(created.url)
  }
  catch (err) {
    toast.error(apiError.message(err))
  }
  finally {
    creating.value = false
  }
}

async function revoke(link: ShareLinkDto) {
  const ok = await ask({ title: t('shareLinks.revokeTitle'), message: t('shareLinks.revokeBody'), confirmLabel: t('shareLinks.revoke'), danger: true })
  if (!ok) return
  try {
    await apiFetch<{ ok: true }>(`/api/share-links/${link.id}`, { method: 'DELETE' })
    toast.success(t('shareLinks.revoked'))
    await refresh()
  }
  catch (err) {
    toast.error(apiError.message(err))
  }
}
</script>
