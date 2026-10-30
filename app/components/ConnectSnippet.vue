<template>
  <div class="space-y-4">
    <div>
      <label
        :for="`${uid}-project`"
        class="label"
      >{{ $t('connect.project') }}</label>
      <select
        :id="`${uid}-project`"
        v-model="projectSlug"
        class="input sm:max-w-xs"
      >
        <option
          v-for="p in projectOptions"
          :key="p.slug"
          :value="p.slug"
        >
          {{ p.name }} ({{ p.slug }})
        </option>
      </select>
    </div>

    <section>
      <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ $t('connect.scriptTitle') }}
      </h4>
      <p class="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
        {{ $t('connect.scriptHelp') }}
      </p>
      <div class="relative">
        <pre class="overflow-x-auto rounded-md bg-gray-900 p-3 pr-10 font-mono text-xs text-gray-100 dark:bg-black/60"><code>{{ scriptSnippet }}</code></pre>
        <button
          type="button"
          class="absolute top-1.5 right-1.5 rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
          :aria-label="`${$t('ui.copy')}: ${$t('connect.scriptTitle')}`"
          @click="copy(scriptSnippet)"
        >
          <Icon
            name="copy"
            class="size-4"
          />
        </button>
      </div>
    </section>

    <section>
      <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ $t('connect.jsonTitle') }}
      </h4>
      <p class="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
        {{ $t('connect.jsonHelp') }}
      </p>
      <div class="relative">
        <pre class="overflow-x-auto rounded-md bg-gray-900 p-3 pr-10 font-mono text-xs text-gray-100 dark:bg-black/60"><code>{{ jsonSnippet }}</code></pre>
        <button
          type="button"
          class="absolute top-1.5 right-1.5 rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
          :aria-label="`${$t('ui.copy')}: .mcp.json`"
          @click="copy(jsonSnippet)"
        >
          <Icon
            name="copy"
            class="size-4"
          />
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Plain token (shown once after creation). A placeholder is used when absent. */
  token?: string | null
  /** Initial default project slug. */
  project?: string | null
}>(), { token: null, project: null })

const { t } = useI18n()
const { copy } = useCopy()
const { projects } = useProjects()
const config = useRuntimeConfig()
const uid = useId()

const projectSlug = ref(props.project ?? 'inbox')

const projectOptions = computed(() => {
  const list = projects.value.filter(p => p.status !== 'archived').map(p => ({ slug: p.slug, name: p.name }))
  return list.length > 0 ? list : [{ slug: 'inbox', name: 'Inbox' }]
})

const siteUrl = computed(() => {
  const configured = typeof config.public.siteUrl === 'string' ? config.public.siteUrl : ''
  const base = configured || (import.meta.client ? window.location.origin : 'http://localhost:3000')
  return base.replace(/\/+$/, '')
})

const tokenValue = computed(() => props.token || 'tm_xxxxxxxxxxxxxxxx')

// The script asks for the token with a hidden prompt (or reads TM_TOKEN), so it never lands in shell history.
const scriptSnippet = computed(() => `pnpm connect ${t('connect.repoPath')} ${projectSlug.value} --url ${siteUrl.value}`)

const jsonSnippet = computed(() => JSON.stringify({
  mcpServers: {
    'task-manager': {
      type: 'http',
      url: `${siteUrl.value}/mcp`,
      headers: {
        'Authorization': `Bearer ${tokenValue.value}`,
        'X-TM-Project': projectSlug.value,
      },
    },
  },
}, null, 2))
</script>
