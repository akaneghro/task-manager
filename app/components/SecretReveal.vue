<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2">
    <template v-if="secret !== null">
      <code
        class="max-w-full min-w-0 rounded bg-gray-100 px-2 py-1 font-mono text-sm break-all text-gray-900 select-all dark:bg-gray-800 dark:text-gray-100"
        :aria-label="label"
      >{{ secret }}</code>
      <button
        type="button"
        class="btn-ghost p-1.5"
        :aria-label="$t('secret.copy')"
        :title="$t('secret.copy')"
        @click="copySecret"
      >
        <Icon
          name="copy"
          class="size-4"
        />
      </button>
      <button
        type="button"
        class="btn-ghost p-1.5"
        :aria-label="$t('secret.hide')"
        :title="$t('secret.hide')"
        @click="hide"
      >
        <Icon
          name="eye-off"
          class="size-4"
        />
      </button>
      <span
        class="text-xs text-gray-400 tabular-nums dark:text-gray-500"
        aria-live="off"
      >{{ $t('secret.autoHide', { s: remaining }) }}</span>
    </template>
    <template v-else>
      <span
        class="font-mono text-sm tracking-widest text-gray-400 dark:text-gray-500"
        aria-hidden="true"
      >••••••••••</span>
      <button
        type="button"
        class="btn-secondary px-2 py-1 text-xs"
        :disabled="loading"
        @click="reveal"
      >
        <Icon
          name="eye"
          class="size-3.5"
        />
        {{ $t('secret.reveal') }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
// Reveals a vault secret on demand (POST /api/accounts/:id/reveal, logged server-side) and hides it again after 30 s.
const props = withDefaults(defineProps<{
  accountId: string
  service?: string
  /** Seconds before the secret is hidden again. */
  timeout?: number
}>(), { service: '', timeout: 30 })

const emit = defineEmits<{ revealed: [] }>()

const { t } = useI18n()
const toast = useToast()
const apiError = useApiError()
const { copy } = useCopy()

const secret = ref<string | null>(null)
const loading = ref(false)
const remaining = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const label = computed(() => t('secret.label', { service: props.service }))

function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}

function hide() {
  stopTimer()
  secret.value = null
  remaining.value = 0
}

async function reveal() {
  loading.value = true
  try {
    const result = await apiFetch<{ secret: string }>(`/api/accounts/${props.accountId}/reveal`, { method: 'POST' })
    secret.value = result.secret
    remaining.value = props.timeout
    stopTimer()
    timer = setInterval(() => {
      remaining.value -= 1
      if (remaining.value <= 0) hide()
    }, 1000)
    emit('revealed')
  }
  catch (err) {
    toast.error(apiError.message(err))
  }
  finally {
    loading.value = false
  }
}

async function copySecret() {
  if (secret.value !== null) await copy(secret.value, t('secret.copied'))
}

watch(() => props.accountId, hide)
onBeforeUnmount(hide)
</script>
