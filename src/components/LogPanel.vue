<template>
  <div class="log-panel">
    <div class="log-header">
      <span>日志</span>
      <div class="log-controls">
        <div v-if="logs.length" class="log-filter" role="group" aria-label="日志类型过滤">
          <button
            v-for="f in filters"
            :key="f.value"
            type="button"
            class="filter-btn"
            :class="{ active: filterType === f.value }"
            @click="filterType = f.value"
          >{{ f.label }}</button>
        </div>
        <input
          v-if="logs.length"
          class="log-search"
          type="text"
          v-model="searchText"
          placeholder="搜索日志…"
          aria-label="搜索日志"
        />
        <button v-if="logs.length" class="sa-btn sa-btn-ghost" type="button" @click="clearLogs">清空</button>
      </div>
    </div>
    <div class="log-content" ref="logContainer">
      <div v-if="!logs.length" class="log-empty">开始缓存后，进度会写在这里</div>
      <div v-else-if="!filteredLogs.length" class="log-empty">没有匹配的日志</div>
      <div
        v-for="(log, index) in filteredLogs"
        :key="index"
        class="log-line"
        :class="log.type"
      >
        <span class="log-time">{{ log.time }}</span>
        <span class="log-msg">{{ log.msg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'

interface LogEntry {
  time: string
  msg: string
  type: 'info' | 'error' | 'success'
}

const props = defineProps<{
  logs: LogEntry[]
}>()

const emit = defineEmits<{
  (e: 'clear'): void
}>()

const logContainer = ref<HTMLDivElement | null>(null)
const searchText = ref('')
const filterType = ref<'all' | 'info' | 'error' | 'success'>('all')

const filters = [
  { value: 'all' as const, label: '全部' },
  { value: 'info' as const, label: '信息' },
  { value: 'error' as const, label: '错误' },
  { value: 'success' as const, label: '成功' },
]

const filteredLogs = computed(() => {
  return props.logs.filter((log) => {
    const matchType = filterType.value === 'all' || log.type === filterType.value
    const matchSearch = !searchText.value
      || log.msg.toLowerCase().includes(searchText.value.toLowerCase())
    return matchType && matchSearch
  })
})

watch(() => props.logs.length, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})

function clearLogs() {
  searchText.value = ''
  filterType.value = 'all'
  emit('clear')
}
</script>

<style scoped>
.log-panel {
  padding-top: 8px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
}

.log-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.log-filter {
  display: flex;
  gap: 2px;
}

.filter-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--sa-hairline);
  background: transparent;
  color: var(--sa-muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.filter-btn.active {
  background: var(--sa-accent);
  border-color: var(--sa-accent);
  color: #fff;
}

.log-search {
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--sa-hairline);
  background: var(--sa-surface);
  color: var(--sa-ink);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  min-width: 120px;
}

.log-search:focus {
  border-color: var(--sa-accent);
}

.log-content {
  max-height: 280px;
  overflow: auto;
  padding: 12px;
  background: var(--sa-log);
  border: 1px solid var(--sa-hairline);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.log-empty {
  color: var(--sa-muted);
  text-align: center;
  padding: 24px 8px;
}

.log-line {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.log-time {
  color: var(--sa-muted);
  flex-shrink: 0;
}

.log-msg {
  word-break: break-all;
  color: var(--sa-ink);
}

.log-line.error .log-msg {
  color: var(--sa-danger);
}

.log-line.success .log-msg {
  color: var(--sa-ok);
}
</style>
