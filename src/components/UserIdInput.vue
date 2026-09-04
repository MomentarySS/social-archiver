<template>
  <label class="sa-field user-id-input">
    <span>{{ platform === 'twitter' ? '用户名' : '用户 ID' }}</span>
    <input
      ref="inputRef"
      class="sa-input user-id-field"
      type="text"
      :value="draft"
      :placeholder="placeholder"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      :lang="isHandlePlatform ? 'en' : undefined"
      inputmode="text"
      @input="onInput"
      @paste="onPaste"
    />
    <p v-if="preview" class="user-id-preview">
      将缓存：<code>@{{ preview }}</code>
      <span v-if="invalid" class="user-id-warn">（含空格，请改成下划线 _）</span>
    </p>
    <p v-else-if="invalid" class="user-id-warn-line">{{ invalidHint }}</p>
    <p v-if="hint" class="user-id-hint">{{ hint }}</p>
  </label>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatUserIdPreview,
  hasInvalidHandleChars,
  normalizeUserId,
  userIdPlaceholder,
} from '../utils/userId.js'

const props = defineProps<{
  modelValue: string
  platform: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const draft = ref(normalizeUserId(props.modelValue, props.platform))

const isHandlePlatform = computed(() =>
  props.platform === 'instagram' || props.platform === 'twitter' || props.platform === 'x',
)

const placeholder = computed(() => userIdPlaceholder(props.platform))

const preview = computed(() => (
  isHandlePlatform.value && draft.value ? formatUserIdPreview(draft.value) : ''
))

const invalid = computed(() => hasInvalidHandleChars(draft.value, props.platform))

const invalidHint = computed(() => (
  props.platform === 'weibo'
    ? '微博请用数字 UID，或粘贴 weibo.com/u/数字（自定义域名抽不出 UID）。'
    : '含空格，请改成下划线 _'
))

const hint = computed(() => {
  if (props.platform === 'instagram') {
    return '可粘贴主页链接。用户名用英文输入法；下方显示将提交的 ID。'
  }
  if (props.platform === 'twitter') {
    return '可粘贴 x.com / twitter.com 主页链接；会自动去掉开头的 @。'
  }
  return '可粘贴 weibo.com/u/数字 或 m.weibo.cn/u/数字。自定义域名主页无法抽出 UID。'
})

watch(
  () => props.modelValue,
  (value) => {
    const next = normalizeUserId(value, props.platform)
    if (next !== draft.value) draft.value = next
  },
)

watch(
  () => props.platform,
  () => {
    commit(draft.value)
  },
)

function commit(raw: string) {
  const next = normalizeUserId(raw, props.platform)
  draft.value = next
  if (inputRef.value && inputRef.value.value !== next) {
    inputRef.value.value = next
  }
  emit('update:modelValue', next)
}

function onInput(event: Event) {
  commit((event.target as HTMLInputElement).value)
}

function onPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text/plain') || event.clipboardData?.getData('text') || ''
  if (!pasted) return
  event.preventDefault()
  const input = event.target as HTMLInputElement
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  commit(`${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`)
}
</script>

<style scoped>
.user-id-input {
  margin-bottom: 16px;
}

.user-id-field {
  font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
  font-size: 14px;
  line-height: 1.45;
  padding: 8px 12px;
  letter-spacing: 0.01em;
}

.user-id-preview {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--sa-ink);
}

.user-id-preview code {
  font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
}

.user-id-warn {
  margin-left: 6px;
  color: #c41e3a;
  font-size: 12px;
}

.user-id-warn-line {
  margin: 8px 0 0;
  font-size: 12px;
  color: #c41e3a;
}

.user-id-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sa-muted);
}
</style>
