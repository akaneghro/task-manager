<template>
  <div class="space-y-4">
    <p
      v-if="comments.length === 0"
      class="text-sm text-gray-400 dark:text-gray-500"
    >
      {{ $t('tasks.comments.empty') }}
    </p>

    <ol
      v-else
      class="space-y-3"
    >
      <li
        v-for="comment in comments"
        :key="comment.id"
        class="flex gap-3"
      >
        <div class="shrink-0">
          <span
            v-if="comment.author.isClaude"
            class="flex size-7 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300"
          >
            <Icon
              name="sparkles"
              class="size-4"
            />
          </span>
          <img
            v-else-if="comment.author.avatarUrl"
            :src="comment.author.avatarUrl"
            alt=""
            class="size-7 rounded-full"
            loading="lazy"
          >
          <span
            v-else
            class="flex size-7 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >{{ initials(authorName(comment)) }}</span>
        </div>

        <div
          class="min-w-0 flex-1 rounded-lg border px-3 py-2"
          :class="comment.author.isClaude
            ? 'border-primary-200 bg-primary-50/50 dark:border-primary-900 dark:bg-primary-950/30'
            : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'"
        >
          <div class="flex flex-wrap items-center gap-x-2 text-xs">
            <span class="inline-flex items-center gap-1 font-semibold text-gray-800 dark:text-gray-200">
              <Icon
                v-if="comment.author.isClaude"
                name="robot"
                class="size-3.5 text-primary-600 dark:text-primary-400"
              />
              {{ authorName(comment) }}
            </span>
            <time
              :datetime="comment.createdAt"
              :title="formatDateTime(comment.createdAt, locale)"
              class="text-gray-500 dark:text-gray-400"
            >{{ formatRelative(comment.createdAt, locale, now) }}</time>
            <span
              v-if="comment.updatedAt !== comment.createdAt"
              class="text-gray-400 dark:text-gray-500"
            >· {{ $t('tasks.comments.edited') }}</span>
            <div
              v-if="comment.canEdit && editingId !== comment.id"
              class="ml-auto flex"
            >
              <button
                type="button"
                class="btn-ghost p-1"
                :aria-label="$t('tasks.comments.edit')"
                @click="startEdit(comment)"
              >
                <Icon
                  name="pencil"
                  class="size-3.5"
                />
              </button>
              <button
                type="button"
                class="btn-ghost p-1 hover:text-red-600 dark:hover:text-red-400"
                :aria-label="$t('tasks.comments.delete')"
                @click="remove(comment)"
              >
                <Icon
                  name="trash"
                  class="size-3.5"
                />
              </button>
            </div>
          </div>

          <form
            v-if="editingId === comment.id"
            class="mt-2 space-y-2"
            @submit.prevent="saveEdit(comment)"
          >
            <MarkdownEditor
              v-model="editText"
              :rows="4"
            />
            <div class="flex gap-2">
              <button
                type="submit"
                class="btn-primary px-2 py-1 text-xs"
                :disabled="!editText.trim() || busy"
              >
                {{ $t('tasks.comments.save') }}
              </button>
              <button
                type="button"
                class="btn-ghost px-2 py-1 text-xs"
                @click="editingId = null"
              >
                {{ $t('tasks.comments.cancel') }}
              </button>
            </div>
          </form>
          <MarkdownView
            v-else
            :source="comment.body"
            class="mt-1"
          />
        </div>
      </li>
    </ol>

    <form
      v-if="canComment"
      class="space-y-2"
      @submit.prevent="add"
    >
      <MarkdownEditor
        v-model="newText"
        :rows="3"
        :placeholder="$t('tasks.comments.placeholder')"
      />
      <div class="flex justify-end">
        <button
          type="submit"
          class="btn-primary"
          :disabled="!newText.trim() || busy"
        >
          <Icon
            name="comment"
            class="size-4"
          />
          {{ $t('tasks.comments.add') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { CommentDto } from '#shared/types/dto'
import { parseTaskSource } from '~/utils/taskDisplay'

const props = defineProps<{
  taskRef: string
  comments: CommentDto[]
  canComment?: boolean
}>()
const emit = defineEmits<{ 'update:comments': [comments: CommentDto[]] }>()

const { t, locale } = useI18n()
const now = useNow()
const mutations = useTaskMutations()
const confirm = useConfirm()

const newText = ref('')
const editingId = ref<string | null>(null)
const editText = ref('')
const busy = ref(false)

function authorName(comment: CommentDto): string {
  if (comment.author.isClaude) {
    const source = parseTaskSource(comment.authorSource)
    return t('tasks.comments.claude', { name: source.kind === 'mcp' ? source.name : 'MCP' })
  }
  return comment.author.login ?? t('tasks.comments.unknownAuthor')
}

async function add() {
  const body = newText.value.trim()
  if (!body || busy.value) return
  busy.value = true
  try {
    const created = await mutations.addComment(props.taskRef, body)
    newText.value = ''
    emit('update:comments', [...props.comments, created])
  }
  catch (err) {
    mutations.reportError(err)
  }
  finally {
    busy.value = false
  }
}

function startEdit(comment: CommentDto) {
  editingId.value = comment.id
  editText.value = comment.body
}

async function saveEdit(comment: CommentDto) {
  const body = editText.value.trim()
  if (!body || busy.value) return
  busy.value = true
  try {
    const saved = await mutations.updateComment(comment.id, body)
    editingId.value = null
    emit('update:comments', props.comments.map(c => (c.id === saved.id ? saved : c)))
  }
  catch (err) {
    mutations.reportError(err)
  }
  finally {
    busy.value = false
  }
}

async function remove(comment: CommentDto) {
  const ok = await confirm.ask({
    title: t('tasks.comments.deleteConfirmTitle'),
    message: t('tasks.comments.deleteConfirmMessage'),
    confirmLabel: t('tasks.comments.delete'),
    danger: true,
  })
  if (!ok) return
  const before = props.comments
  emit('update:comments', before.filter(c => c.id !== comment.id))
  try {
    await mutations.deleteComment(comment.id)
  }
  catch (err) {
    emit('update:comments', before)
    mutations.reportError(err)
  }
}
</script>
