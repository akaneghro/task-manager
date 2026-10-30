<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
    <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-50">
      {{ $t('settings.title') }}
    </h1>

    <section
      v-if="sessionUser"
      class="card flex items-center gap-3 p-4"
      aria-labelledby="settings-account"
    >
      <h2
        id="settings-account"
        class="sr-only"
      >
        {{ $t('settings.account') }}
      </h2>
      <img
        v-if="sessionUser.avatarUrl"
        :src="sessionUser.avatarUrl"
        alt=""
        class="size-12 rounded-full border border-gray-200 dark:border-gray-700"
        referrerpolicy="no-referrer"
      >
      <span
        v-else
        class="flex size-12 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900 dark:text-primary-200"
      >{{ initials(sessionUser.name || sessionUser.login) }}</span>
      <div class="min-w-0">
        <p class="truncate font-medium text-gray-900 dark:text-gray-100">
          {{ sessionUser.name || sessionUser.login }}
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          @{{ sessionUser.login }} · {{ isOwner ? $t('settings.roleOwner') : $t('settings.roleMember') }}
        </p>
      </div>
    </section>

    <section
      class="card p-4 sm:p-5"
      aria-labelledby="settings-preferences"
    >
      <h2
        id="settings-preferences"
        class="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100"
      >
        {{ $t('settings.preferences') }}
      </h2>
      <div class="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend class="label">
            {{ $t('settings.language') }}
          </legend>
          <div class="flex gap-2">
            <button
              v-for="option in localeOptions"
              :key="option.code"
              type="button"
              class="flex-1"
              :class="locale === option.code ? 'btn-primary' : 'btn-secondary'"
              :aria-pressed="locale === option.code"
              @click="setLocale(option.code)"
            >
              {{ option.name }}
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend class="label">
            {{ $t('settings.theme') }}
          </legend>
          <div class="flex gap-2">
            <button
              v-for="mode in (['light', 'dark'] as const)"
              :key="mode"
              type="button"
              class="flex-1"
              :class="colorMode.value === mode ? 'btn-primary' : 'btn-secondary'"
              :aria-pressed="colorMode.value === mode"
              @click="colorMode.set(mode)"
            >
              <Icon
                :name="mode === 'dark' ? 'moon' : 'sun'"
                class="size-4"
              />
              {{ $t(`theme.${mode}`) }}
            </button>
          </div>
        </fieldset>
      </div>
    </section>

    <section
      class="card p-4 sm:p-5"
      aria-labelledby="settings-tokens"
    >
      <h2
        id="settings-tokens"
        class="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100"
      >
        <Icon
          name="key"
          class="size-4"
        />
        {{ $t('tokens.title') }}
      </h2>
      <TokenManager v-if="isOwner" />
      <p
        v-else
        class="text-sm text-gray-500 dark:text-gray-400"
      >
        {{ $t('tokens.forbidden') }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
const colorMode = useColorMode()
const { user } = useUserSession()

usePageTitle(() => t('settings.title'))

const sessionUser = computed(() => toSessionUser(user.value))
const isOwner = computed(() => sessionUser.value?.role === 'owner')

const localeOptions = computed(() => locales.value.map(l => (typeof l === 'string' ? { code: l, name: l } : { code: l.code, name: l.name ?? l.code })))
</script>
