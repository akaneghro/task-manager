<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <p class="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        {{ $t('vault.description') }}
      </p>
      <button
        type="button"
        class="btn-primary"
        @click="openForm(null)"
      >
        <Icon
          name="plus"
          class="size-4"
        />
        {{ $t('vault.add') }}
      </button>
    </div>

    <p
      v-if="error"
      class="text-sm text-red-600 dark:text-red-400"
    >
      {{ apiError.message(error) }}
    </p>
    <p
      v-else-if="pending && !accounts"
      class="text-sm text-gray-500"
    >
      {{ $t('ui.loading') }}
    </p>
    <div
      v-else-if="!accounts || accounts.length === 0"
      class="card"
    >
      <EmptyState
        icon="lock"
        :title="$t('vault.empty')"
        :description="$t('vault.emptyHint')"
      >
        <button
          type="button"
          class="btn-primary"
          @click="openForm(null)"
        >
          <Icon
            name="plus"
            class="size-4"
          />
          {{ $t('vault.add') }}
        </button>
      </EmptyState>
    </div>
    <ul
      v-else
      class="grid gap-3 md:grid-cols-2"
    >
      <li
        v-for="account in accounts"
        :key="account.id"
        class="card flex flex-col gap-3 p-4"
      >
        <div class="flex items-start gap-2">
          <Icon
            name="key"
            class="mt-0.5 size-4 shrink-0 text-gray-400"
          />
          <div class="min-w-0 flex-1">
            <h3 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ account.service }}
            </h3>
            <a
              v-if="account.url"
              :href="account.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary-600 hover:underline dark:text-primary-400"
            >
              <span class="truncate">{{ account.url }}</span>
              <Icon
                name="external"
                class="size-3 shrink-0"
              />
            </a>
          </div>
          <span
            v-if="account.shareWithClaude"
            class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
          >
            <Icon
              name="robot"
              class="size-3"
            />
            {{ $t('vault.sharedBadge') }}
          </span>
          <button
            type="button"
            class="btn-ghost -my-1 p-1.5"
            :aria-label="`${$t('ui.edit')}: ${account.service}`"
            @click="openForm(account)"
          >
            <Icon
              name="pencil"
              class="size-4"
            />
          </button>
          <button
            type="button"
            class="btn-ghost -my-1 p-1.5 text-red-600 dark:text-red-400"
            :aria-label="`${$t('ui.delete')}: ${account.service}`"
            @click="remove(account)"
          >
            <Icon
              name="trash"
              class="size-4"
            />
          </button>
        </div>

        <dl class="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1.5 text-sm">
          <template v-if="account.username">
            <dt class="text-gray-500 dark:text-gray-400">
              {{ $t('vault.username') }}
            </dt>
            <dd class="flex min-w-0 items-center gap-1">
              <span class="truncate font-mono">{{ account.username }}</span>
              <button
                type="button"
                class="btn-ghost p-1"
                :aria-label="`${$t('ui.copy')}: ${$t('vault.username')}`"
                @click="copy(account.username)"
              >
                <Icon
                  name="copy"
                  class="size-3.5"
                />
              </button>
            </dd>
          </template>
          <dt class="text-gray-500 dark:text-gray-400">
            {{ $t('vault.secret') }}
          </dt>
          <dd class="min-w-0">
            <SecretReveal
              v-if="account.hasSecret"
              :account-id="account.id"
              :service="account.service"
              @revealed="refresh()"
            />
            <span
              v-else
              class="text-gray-400 dark:text-gray-500"
            >{{ $t('vault.noSecret') }}</span>
          </dd>
        </dl>

        <p
          v-if="account.notes"
          class="text-sm whitespace-pre-line text-gray-600 dark:text-gray-300"
        >
          {{ account.notes }}
        </p>

        <p class="mt-auto flex flex-wrap gap-x-3 border-t border-gray-100 pt-2 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
          <span>
            {{ account.lastAccessedAt
              ? $t('vault.lastAccess', { when: formatRelative(account.lastAccessedAt, locale, now), source: describeSource(account.lastAccessedSource) })
              : $t('vault.neverAccessed') }}
          </span>
          <span v-if="account.accessCount > 0">{{ $t('vault.accessCount', { n: account.accessCount }, account.accessCount) }}</span>
        </p>
      </li>
    </ul>

    <AppModal
      v-model:open="formOpen"
      :title="editing ? $t('vault.editTitle') : $t('vault.addTitle')"
    >
      <AccountForm
        v-if="formOpen"
        :slug="slug"
        :account="editing"
        @saved="onSaved"
        @cancel="formOpen = false"
      />
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import type { AccountDto } from '#shared/types/dto'

const props = defineProps<{ slug: string }>()

const { t, locale } = useI18n()
const now = useNow()
const toast = useToast()
const apiError = useApiError()
const { ask } = useConfirm()
const { copy } = useCopy()

const { data: accounts, pending, error, refresh } = useFetch<AccountDto[]>(
  () => `/api/projects/${encodeURIComponent(props.slug)}/accounts`,
  { key: computed(() => `tm:accounts:${props.slug}`) },
)

const formOpen = ref(false)
const editing = ref<AccountDto | null>(null)

function openForm(account: AccountDto | null) {
  editing.value = account
  formOpen.value = true
}

async function onSaved() {
  formOpen.value = false
  await refresh()
}

/** `user:<id>` -> "web", `mcp:<tokenName>` -> "Claude (tokenName)". */
function describeSource(source: string | null): string {
  if (!source) return ''
  if (source.startsWith('mcp:')) return t('vault.sourceMcp', { name: source.slice(4) })
  if (source.startsWith('user:')) return t('vault.sourceUser')
  return source
}

async function remove(account: AccountDto) {
  const ok = await ask({
    title: t('vault.deleteTitle', { service: account.service }),
    message: t('vault.deleteBody'),
    confirmLabel: t('ui.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await apiFetch<{ ok: true }>(`/api/accounts/${account.id}`, { method: 'DELETE' })
    toast.success(t('vault.deleted'))
    await refresh()
  }
  catch (err) {
    toast.error(apiError.message(err))
  }
}
</script>
