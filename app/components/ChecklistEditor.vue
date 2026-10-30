<template>
  <div>
    <div
      v-if="items.length > 0"
      class="mb-2 flex items-center gap-2"
    >
      <div
        class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
        role="progressbar"
        :aria-valuenow="doneCount"
        :aria-valuemin="0"
        :aria-valuemax="items.length"
        :aria-label="$t('tasks.fields.checklist')"
      >
        <div
          class="h-full rounded-full bg-emerald-500 transition-all dark:bg-emerald-400"
          :style="{ width: `${(doneCount / items.length) * 100}%` }"
        />
      </div>
      <span class="text-xs text-gray-500 dark:text-gray-400">{{ $t('tasks.checklist.progress', { done: doneCount, total: items.length }) }}</span>
    </div>

    <p
      v-if="items.length === 0 && readonly"
      class="text-sm text-gray-400 dark:text-gray-500"
    >
      {{ $t('tasks.checklist.empty') }}
    </p>

    <VueDraggable
      v-model="list"
      tag="ul"
      handle=".tm-handle"
      :animation="150"
      :disabled="readonly"
      class="space-y-0.5"
      @end="onReorder"
    >
      <li
        v-for="item in list"
        :key="item.id"
        class="group flex items-start gap-2 rounded px-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <button
          v-if="!readonly"
          type="button"
          class="tm-handle mt-0.5 cursor-grab text-gray-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 dark:text-gray-600"
          :aria-label="$t('tasks.checklist.reorder')"
          tabindex="-1"
        >
          <Icon
            name="grip"
            class="size-4"
          />
        </button>
        <input
          type="checkbox"
          class="mt-0.5 size-4 shrink-0 rounded border-gray-300 text-emerald-600 dark:border-gray-600"
          :checked="item.done"
          :disabled="readonly"
          :aria-label="$t('tasks.checklist.toggle', { text: item.text })"
          @change="toggle(item)"
        >
        <form
          v-if="editingId === item.id"
          class="flex flex-1 gap-1"
          @submit.prevent="saveEdit(item)"
        >
          <input
            ref="editInput"
            v-model="editText"
            type="text"
            class="input py-0.5"
            maxlength="500"
            :aria-label="$t('tasks.checklist.edit')"
            @keydown.esc.stop="editingId = null"
            @blur="saveEdit(item)"
          >
        </form>
        <span
          v-else
          class="min-w-0 flex-1 text-sm break-words"
          :class="[item.done ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-800 dark:text-gray-200', readonly ? '' : 'cursor-text']"
          @dblclick="startEdit(item)"
        >{{ item.text }}</span>
        <div
          v-if="!readonly && editingId !== item.id"
          class="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        >
          <button
            type="button"
            class="btn-ghost p-1"
            :aria-label="$t('tasks.checklist.edit')"
            @click="startEdit(item)"
          >
            <Icon
              name="pencil"
              class="size-3.5"
            />
          </button>
          <button
            type="button"
            class="btn-ghost p-1 hover:text-red-600 dark:hover:text-red-400"
            :aria-label="$t('tasks.checklist.delete')"
            @click="remove(item)"
          >
            <Icon
              name="trash"
              class="size-3.5"
            />
          </button>
        </div>
      </li>
    </VueDraggable>

    <form
      v-if="!readonly"
      class="mt-2 flex gap-2"
      @submit.prevent="add"
    >
      <label
        :for="`${id}-new`"
        class="sr-only"
      >{{ $t('tasks.checklist.newItem') }}</label>
      <input
        :id="`${id}-new`"
        v-model="newText"
        type="text"
        class="input"
        maxlength="500"
        :placeholder="$t('tasks.checklist.placeholder')"
        :disabled="adding"
      >
      <button
        type="submit"
        class="btn-secondary"
        :disabled="!newText.trim() || adding"
      >
        {{ $t('tasks.checklist.add') }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { ChecklistItemDto } from '#shared/types/dto'
import { positionBetween } from '#shared/utils/position'

const props = defineProps<{
  taskRef: string
  items: ChecklistItemDto[]
  readonly?: boolean
}>()
const emit = defineEmits<{ 'update:items': [items: ChecklistItemDto[]] }>()

const mutations = useTaskMutations()
const id = useId()

const list = ref<ChecklistItemDto[]>([...props.items])
watch(() => props.items, (items) => {
  list.value = [...items]
})

const doneCount = computed(() => props.items.filter(item => item.done).length)
const newText = ref('')
const adding = ref(false)
const editingId = ref<string | null>(null)
const editText = ref('')
const editInput = useTemplateRef<HTMLInputElement[]>('editInput')

function publish(items: ChecklistItemDto[]) {
  list.value = items
  emit('update:items', items)
}

function replaceItem(items: ChecklistItemDto[], item: ChecklistItemDto): ChecklistItemDto[] {
  return items.map(i => (i.id === item.id ? item : i))
}

async function toggle(item: ChecklistItemDto) {
  const before = props.items
  publish(replaceItem(before, { ...item, done: !item.done }))
  try {
    const saved = await mutations.updateChecklistItem(item.id, { done: !item.done })
    publish(replaceItem(props.items, saved))
  }
  catch (err) {
    publish(before)
    mutations.reportError(err)
  }
}

async function startEdit(item: ChecklistItemDto) {
  if (props.readonly) return
  editingId.value = item.id
  editText.value = item.text
  await nextTick()
  editInput.value?.[0]?.focus()
}

async function saveEdit(item: ChecklistItemDto) {
  if (editingId.value !== item.id) return
  editingId.value = null
  const text = editText.value.trim()
  if (!text || text === item.text) return
  const before = props.items
  publish(replaceItem(before, { ...item, text }))
  try {
    const saved = await mutations.updateChecklistItem(item.id, { text })
    publish(replaceItem(props.items, saved))
  }
  catch (err) {
    publish(before)
    mutations.reportError(err)
  }
}

async function remove(item: ChecklistItemDto) {
  const before = props.items
  publish(before.filter(i => i.id !== item.id))
  try {
    await mutations.deleteChecklistItem(item.id)
  }
  catch (err) {
    publish(before)
    mutations.reportError(err)
  }
}

async function add() {
  const text = newText.value.trim()
  if (!text || adding.value) return
  adding.value = true
  try {
    const items = await mutations.addChecklistItems(props.taskRef, [text])
    newText.value = ''
    publish(items)
  }
  catch (err) {
    mutations.reportError(err)
  }
  finally {
    adding.value = false
  }
}

async function onReorder(event: { oldIndex?: number, newIndex?: number }) {
  if (event.oldIndex === event.newIndex) return
  const before = props.items
  const index = event.newIndex ?? 0
  const moved = list.value[index]
  if (!moved) return
  const position = positionBetween(list.value[index - 1]?.position, list.value[index + 1]?.position)
  const reordered = list.value.map(i => (i.id === moved.id ? { ...i, position } : i))
  publish(reordered)
  try {
    const saved = await mutations.updateChecklistItem(moved.id, { position })
    publish(replaceItem(props.items, saved))
  }
  catch (err) {
    publish(before)
    mutations.reportError(err)
  }
}
</script>
