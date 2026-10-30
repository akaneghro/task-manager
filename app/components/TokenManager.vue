<template>
  <div class="space-y-5">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      {{ $t('tokens.description') }}
    </p>

    <!-- Freshly created token: shown once -->
    <div
      v-if="created"
      class="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40"
      role="status"
    >
      <div>
        <h4 class="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          {{ $t('tokens.createdTitle', { name: created.name }) }}
        </h4>
        <p class="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-200">
          <Icon
            name="alert"
            class="size-3.5"
          />
          {{ $t('tokens.createdWarning') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <code class="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-3 py-2 font-mono text-sm break-all text-gray-900 select-all dark:border-emerald-900 dark:bg-gray-900 dark:text-gray-100">{{ created.token }}</code>
        <button
          type="button"
          class="btn-primary"
          @click="copy(created.token, $t('tokens.copied'))"
        >
          <Icon
            name="copy"
            class="size-4"
          />
          <span class="hidden sm:inline">{{ $t('tokens.copy') }}</span>
        </button>
      </div>
      <div class="rounded-md bg-white p-3 dark:bg-gray-900">
        <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {{ $t('connect.title') }}
        </h4>
        <ConnectSnippet :token="created.token" />
      </div>
      <div class="flex justify-end">
        <button
          type="button"
          class="btn-secondary"
          @click="created = null"
        >
          {{ $t('tokens.dismiss') }}
        </button>
      </div>
    </div>

    <form
      class="grid gap-3 rounded-lg border border-gray-200 p-4 sm:grid-cols-[1fr_10rem] dark:border-gray-800"
      @submit.prevent="create"
    >
      <div>
        <label
          :for="`${uid}-name`"
          class="label"
        >{{ $t('tokens.name') }}</label>
        <input
          :id="`${uid}-name`"
          v-model="name"
          type="text"
          class="input"
          maxlength="60"
          autocomplete="off"
          :placeholder="$t('tokens.namePlaceholder')"
        >
      </div>
      <div>
        <label
          :for="`${uid}-expiry`"
          class="label"
        >{{ $t('tokens.expiry') }}</label>
        <select
          :id="`${uid}-expiry`"
          v-model="expiresInDays"
          class="input"
        >
          <option :value="null">
            {{ $t('tokens.expiryNever') }}
          </option>
          <option
            v-for="days in EXPIRY_OPTIONS"
            :key="days"
            :value="days"
          >
            {{ $t('tokens.expiryDays', { n: days }) }}
          </option>
        </select>
      </div>
      <label class="flex items-start gap-2 text-sm sm:col-span-2">
        <input
          v-model="allowSecrets"
          type="checkbox"
          class="mt-0.5 rounded border-gray-300 dark:border-gray-600"
          :aria-describedby="`${uid}-secrets-help`"
        >
        <span>
          <span class="font-medium text-gray-900 dark:text-gray-100">{{ $t('tokens.allowSecrets') }}</span>
          <span
            :id="`${uid}-secrets-help`"
            class="block text-xs text-gray-500 dark:text-gray-400"
          >{{ $t('tokens.allowSecretsHelp') }}</span>
        </span>
      </label>
      <p
        v-if="formError"
        role="alert"
        class="text-sm text-red-600 sm:col-span-2 dark:text-red-400"
      >
        {{ formError }}
      </p>
      <div class="flex justify-end sm:col-span-2">
        <button
          type="submit"
          class="btn-primary"
          :disabled="creating || !name.trim()"
        >
          <Icon
            name="key"
            class="size-4"
          />
          {{ $t('tokens.create') }}
        </button>
      </div>
    </form>

    <p
      v-if="error"
      class="text-sm text-red-600 dark:text-red-400"
    >
      {{ apiError.message(error) }}
    </p>
    <p
      v-else-if="!tokens || tokens.length === 0"
      class="text-sm text-gray-500 dark:text-gray-400"
    >
      {{ pending ? $t('ui.loading') : $t('tokens.empty') }}
    </p>
    <div
      v-else
      class="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800"
    >
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-50 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          <tr>
            <th
              scope="col"
              class="px-3 py-2 font-medium"
            >
              {{ $t('tokens.name') }}
            </th>
            <th
              scope="col"
              class="px-3 py-2 font-medium"
            >
              {{ $t('tokens.prefix') }}
            </th>
            <th
              scope="col"
              class="hidden px-3 py-2 font-medium sm:table-cell"
            >
              {{ $t('tokens.lastUsed') }}
            </th>
            <th
              scope="col"
              class="hidden px-3 py-2 font-medium md:table-cell"
            >
              {{ $t('tokens.expires') }}
            </th>
            <th
              scope="col"
              class="px-3 py-2"
            >
              <span class="sr-only">{{ $t('tokens.revoke') }}</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
          <tr
            v-for="token in tokens"
            :key="token.id"
          >
            <td class="px-3 py-2">
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ token.name }}</span>
              <span
                v-if="token.allowSecrets"
                class="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
              >
                <Icon
                  name="lock"
                  class="size-3"
                />
                {{ $t('tokens.secretsBadge') }}
              </span>
              <span class="block text-xs text-gray-400 dark:text-gray-500">{{ $t('tokens.created') }} {{ formatDate(token.createdAt, locale) }}</span>
            </td>
            <td class="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">
              {{ token.tokenPrefix }}…
            </td>
            <td class="hidden px-3 py-2 text-gray-600 sm:table-cell dark:text-gray-300">
              {{ token.lastUsedAt ? formatRelative(token.lastUsedAt, locale, now) : $t('ui.never') }}
            </td>
            <td
              class="hidden px-3 py-2 md:table-cell"
              :class="isExpired(token.expiresAt) ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'"
            >
              {{ token.expiresAt ? formatDate(token.expiresAt, locale) : $t('ui.never') }}
            </td>
            <td class="px-3 py-2 text-right">
              <button
                type="button"
                class="btn-ghost p-1.5 text-red-600 dark:text-red-400"
                :aria-label="`${$t('tokens.revoke')}: ${token.name}`"
                :title="$t('tokens.revoke')"
                @click="revoke(token)"
              >
                <Icon
                  name="trash"
                  class="size-4"
                />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { createTokenSchema } from '#shared/schemas/token'
import type { CreatedTokenDto, TokenDto } from '#shared/types/dto'

const EXPIRY_OPTIONS = [30, 90, 365] as const

const { t, locale } = useI18n()
const now = useNow()
const toast = useToast()
const apiError = useApiError()
const { ask } = useConfirm()
const { copy } = useCopy()
const uid = useId()

const { data: tokens, pending, error, refresh } = useFetch<TokenDto[]>('/api/tokens', { key: 'tm:tokens' })

const name = ref('')
const allowSecrets = ref(false)
const expiresInDays = ref<number | null>(null)
const creating = ref(false)
const formError = ref<string | null>(null)
const created = ref<CreatedTokenDto | null>(null)

function isExpired(expiresAt: string | null): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() < Date.now()
}

async function create() {
  formError.value = null
  const body = { name: name.value.trim(), allowSecrets: allowSecrets.value, expiresInDays: expiresInDays.value }
  const parsed = createTokenSchema.safeParse(body)
  if (!parsed.success) {
    formError.value = firstIssueField(parsed.error.issues) === 'name' ? t('tokens.invalidName') : t('errors.validation')
    return
  }
  creating.value = true
  try {
    created.value = await apiFetch<CreatedTokenDto>('/api/tokens', { method: 'POST', body })
    name.value = ''
    allowSecrets.value = false
    expiresInDays.value = null
    await refresh()
  }
  catch (err) {
    formError.value = apiError.message(err)
  }
  finally {
    creating.value = false
  }
}

async function revoke(token: TokenDto) {
  const ok = await ask({
    title: t('tokens.revokeTitle', { name: token.name }),
    message: t('tokens.revokeBody'),
    confirmLabel: t('tokens.revoke'),
    danger: true,
  })
  if (!ok) return
  try {
    await apiFetch<{ ok: true }>(`/api/tokens/${token.id}`, { method: 'DELETE' })
    toast.success(t('tokens.revoked'))
    if (created.value?.id === token.id) created.value = null
    await refresh()
  }
  catch (err) {
    toast.error(apiError.message(err))
  }
}
</script>
