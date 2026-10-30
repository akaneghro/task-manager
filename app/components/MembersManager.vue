<template>
  <div class="space-y-4">
    <p class="text-sm text-gray-500 dark:text-gray-400">
      {{ $t('members.description') }}
    </p>

    <form
      class="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
      @submit.prevent="invite"
    >
      <div>
        <label
          :for="`${uid}-login`"
          class="label"
        >{{ $t('members.login') }}</label>
        <input
          :id="`${uid}-login`"
          v-model="login"
          type="text"
          class="input"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="39"
          :placeholder="$t('members.loginPlaceholder')"
        >
      </div>
      <div>
        <label
          :for="`${uid}-role`"
          class="label"
        >{{ $t('members.role') }}</label>
        <select
          :id="`${uid}-role`"
          v-model="role"
          class="input"
        >
          <option
            v-for="r in MEMBER_ROLES"
            :key="r"
            :value="r"
          >
            {{ $t(`members.roles.${r}`) }}
          </option>
        </select>
      </div>
      <button
        type="submit"
        class="btn-primary"
        :disabled="inviting || !login.trim()"
      >
        <Icon
          name="plus"
          class="size-4"
        />
        {{ $t('members.invite') }}
      </button>
    </form>
    <p
      v-if="formError"
      role="alert"
      class="text-sm text-red-600 dark:text-red-400"
    >
      {{ formError }}
    </p>

    <p
      v-if="pending && !members"
      class="text-sm text-gray-500"
    >
      {{ $t('ui.loading') }}
    </p>
    <p
      v-else-if="error"
      class="text-sm text-red-600 dark:text-red-400"
    >
      {{ apiError.message(error) }}
    </p>
    <p
      v-else-if="!members || members.length === 0"
      class="text-sm text-gray-500 dark:text-gray-400"
    >
      {{ $t('members.empty') }}
    </p>
    <ul
      v-else
      class="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800"
    >
      <li
        v-for="member in members"
        :key="member.id"
        class="flex flex-wrap items-center gap-3 px-3 py-2"
      >
        <img
          v-if="member.avatarUrl"
          :src="member.avatarUrl"
          alt=""
          class="size-8 rounded-full"
          referrerpolicy="no-referrer"
        >
        <span
          v-else
          class="flex size-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300"
        >{{ initials(member.githubLogin) }}</span>
        <div class="min-w-0 flex-1">
          <a
            :href="`https://github.com/${member.githubLogin}`"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium text-gray-900 hover:underline dark:text-gray-100"
          >{{ member.githubLogin }}</a>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ member.acceptedAt ? $t('members.accepted', { when: formatDate(member.acceptedAt, locale) }) : $t('members.pending') }}
          </p>
        </div>
        <label
          class="sr-only"
          :for="`${uid}-role-${member.id}`"
        >{{ $t('members.role') }}</label>
        <select
          :id="`${uid}-role-${member.id}`"
          :value="member.role"
          class="input w-auto"
          @change="changeRole(member, $event)"
        >
          <option
            v-for="r in MEMBER_ROLES"
            :key="r"
            :value="r"
          >
            {{ $t(`members.roles.${r}`) }}
          </option>
        </select>
        <button
          type="button"
          class="btn-ghost p-1.5 text-red-600 dark:text-red-400"
          :aria-label="$t('members.revoke')"
          :title="$t('members.revoke')"
          @click="revoke(member)"
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
import { inviteMemberSchema } from '#shared/schemas/project'
import type { MemberDto } from '#shared/types/dto'
import { MEMBER_ROLES, type MemberRole } from '#shared/utils/enums'

const props = defineProps<{ slug: string }>()

const { t, locale } = useI18n()
const toast = useToast()
const apiError = useApiError()
const { ask } = useConfirm()
const uid = useId()

const { data: members, pending, error, refresh } = useFetch<MemberDto[]>(
  () => `/api/projects/${encodeURIComponent(props.slug)}/members`,
  { key: computed(() => `tm:members:${props.slug}`) },
)

const login = ref('')
const role = ref<MemberRole>('viewer')
const inviting = ref(false)
const formError = ref<string | null>(null)

async function invite() {
  formError.value = null
  const body = { githubLogin: login.value.trim().replace(/^@/, ''), role: role.value }
  const parsed = inviteMemberSchema.safeParse(body)
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? t('errors.validation')
    return
  }
  inviting.value = true
  try {
    await apiFetch<MemberDto>(`/api/projects/${encodeURIComponent(props.slug)}/members`, { method: 'POST', body })
    toast.success(t('members.invited', { login: body.githubLogin }))
    login.value = ''
    await refresh()
  }
  catch (err) {
    formError.value = apiError.message(err)
  }
  finally {
    inviting.value = false
  }
}

async function changeRole(member: MemberDto, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const next = MEMBER_ROLES.find(r => r === target.value)
  if (!next || next === member.role) return
  try {
    await apiFetch<MemberDto>(`/api/members/${member.id}`, { method: 'PATCH', body: { role: next } })
    toast.success(t('members.roleUpdated'))
  }
  catch (err) {
    toast.error(apiError.message(err))
    target.value = member.role
  }
  await refresh()
}

async function revoke(member: MemberDto) {
  const ok = await ask({
    title: t('members.revokeTitle', { login: member.githubLogin }),
    message: t('members.revokeBody'),
    confirmLabel: t('members.revoke'),
    danger: true,
  })
  if (!ok) return
  try {
    await apiFetch<{ ok: true }>(`/api/members/${member.id}`, { method: 'DELETE' })
    toast.success(t('members.revoked'))
    await refresh()
  }
  catch (err) {
    toast.error(apiError.message(err))
  }
}
</script>
