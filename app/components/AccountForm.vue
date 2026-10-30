<template>
  <form
    class="space-y-4"
    novalidate
    autocomplete="off"
    @submit.prevent="submit"
  >
    <div
      v-if="formError"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {{ formError }}
    </div>

    <div>
      <label
        :for="`${uid}-service`"
        class="label"
      >{{ $t('vault.service') }}</label>
      <input
        :id="`${uid}-service`"
        v-model="form.service"
        type="text"
        class="input"
        maxlength="120"
        required
        autofocus
        :placeholder="$t('vault.servicePlaceholder')"
      >
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label
          :for="`${uid}-url`"
          class="label"
        >{{ $t('vault.url') }} <span class="font-normal opacity-70">({{ $t('ui.optional') }})</span></label>
        <input
          :id="`${uid}-url`"
          v-model="form.url"
          type="url"
          class="input font-mono"
          maxlength="2000"
          placeholder="https://"
        >
      </div>
      <div>
        <label
          :for="`${uid}-username`"
          class="label"
        >{{ $t('vault.username') }} <span class="font-normal opacity-70">({{ $t('ui.optional') }})</span></label>
        <input
          :id="`${uid}-username`"
          v-model="form.username"
          type="text"
          class="input"
          maxlength="200"
          autocomplete="off"
        >
      </div>
    </div>

    <div>
      <label
        :for="`${uid}-secret`"
        class="label"
      >{{ $t('vault.secret') }}</label>
      <div class="relative">
        <input
          :id="`${uid}-secret`"
          v-model="form.secret"
          :type="showSecret ? 'text' : 'password'"
          class="input pr-9 font-mono"
          maxlength="10000"
          autocomplete="new-password"
          :disabled="removeSecret"
          :aria-describedby="account?.hasSecret ? `${uid}-secret-hint` : undefined"
        >
        <button
          type="button"
          class="absolute inset-y-0 right-0 flex items-center px-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          :aria-label="showSecret ? $t('secret.hide') : $t('secret.reveal')"
          @click="showSecret = !showSecret"
        >
          <Icon
            :name="showSecret ? 'eye-off' : 'eye'"
            class="size-4"
          />
        </button>
      </div>
      <template v-if="account?.hasSecret">
        <p
          :id="`${uid}-secret-hint`"
          class="mt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          {{ $t('vault.secretKeep') }}
        </p>
        <label class="mt-1 inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input
            v-model="removeSecret"
            type="checkbox"
            class="rounded border-gray-300 dark:border-gray-600"
          >
          {{ $t('vault.secretRemove') }}
        </label>
      </template>
    </div>

    <div>
      <label
        :for="`${uid}-notes`"
        class="label"
      >{{ $t('vault.notes') }}</label>
      <textarea
        :id="`${uid}-notes`"
        v-model="form.notes"
        rows="3"
        class="input resize-y"
        maxlength="5000"
      />
    </div>

    <div
      class="rounded-md border p-3"
      :class="form.shareWithClaude ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50' : 'border-gray-200 dark:border-gray-800'"
    >
      <label class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <input
          v-model="form.shareWithClaude"
          type="checkbox"
          role="switch"
          :aria-checked="form.shareWithClaude"
          :aria-describedby="`${uid}-share-warning`"
          class="rounded border-gray-300 dark:border-gray-600"
        >
        <Icon
          name="robot"
          class="size-4"
        />
        {{ $t('vault.shareWithClaude') }}
      </label>
      <p
        :id="`${uid}-share-warning`"
        class="mt-1.5 flex gap-1.5 text-xs text-amber-800 dark:text-amber-200"
      >
        <Icon
          name="alert"
          class="mt-0.5 size-3.5 shrink-0"
        />
        {{ $t('vault.shareWarning') }}
      </p>
    </div>

    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="btn-secondary"
        @click="emit('cancel')"
      >
        {{ $t('ui.cancel') }}
      </button>
      <button
        type="submit"
        class="btn-primary"
        :disabled="saving || !form.service.trim()"
      >
        {{ saving ? $t('ui.saving') : $t('ui.save') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { createAccountSchema, updateAccountSchema } from '#shared/schemas/project'
import type { AccountDto } from '#shared/types/dto'

const props = withDefaults(defineProps<{
  slug: string
  /** Edit mode when present. */
  account?: AccountDto | null
}>(), { account: null })

const emit = defineEmits<{ saved: [account: AccountDto], cancel: [] }>()

const { t } = useI18n()
const toast = useToast()
const apiError = useApiError()
const uid = useId()

const form = reactive({
  service: props.account?.service ?? '',
  url: props.account?.url ?? '',
  username: props.account?.username ?? '',
  notes: props.account?.notes ?? '',
  secret: '',
  shareWithClaude: props.account?.shareWithClaude ?? false,
})
const removeSecret = ref(false)
const showSecret = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

async function submit() {
  formError.value = null
  const base = {
    service: form.service.trim(),
    url: emptyToNull(form.url),
    username: emptyToNull(form.username),
    notes: form.notes,
    shareWithClaude: form.shareWithClaude,
  }
  saving.value = true
  try {
    let saved: AccountDto
    if (props.account) {
      const body: Record<string, unknown> = { ...base }
      if (removeSecret.value) body.secret = null
      else if (form.secret) body.secret = form.secret
      const parsed = updateAccountSchema.safeParse(body)
      if (!parsed.success) {
        formError.value = parsed.error.issues[0]?.message ?? t('errors.validation')
        return
      }
      saved = await apiFetch<AccountDto>(`/api/accounts/${props.account.id}`, { method: 'PATCH', body })
    }
    else {
      const body = { ...base, secret: form.secret ? form.secret : null }
      const parsed = createAccountSchema.safeParse(body)
      if (!parsed.success) {
        formError.value = parsed.error.issues[0]?.message ?? t('errors.validation')
        return
      }
      saved = await apiFetch<AccountDto>(`/api/projects/${encodeURIComponent(props.slug)}/accounts`, { method: 'POST', body })
    }
    form.secret = ''
    toast.success(t('vault.saved'))
    emit('saved', saved)
  }
  catch (err) {
    formError.value = apiError.message(err)
  }
  finally {
    saving.value = false
  }
}
</script>
