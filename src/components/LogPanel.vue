<template>
  <div
    class="log-panel"
    :class="{
      'log-panel--side': side,
      'log-panel--docked': docked && !side,
      'log-panel--fill': fill && !docked && !side,
    }"
  >
    <div class="log-header">
      <div class="log-title">
        <span>日志</span>
        <span v-if="logs.length" class="log-count">{{ logs.length }}</span>
      </div>
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
        <button v-if="logs.length" class="sa-btn sa-btn-ghost log-clear-btn" type="button" @click="clearLogs">
          清空
        </button>
      </div>
    </div>
    <div class="log-content" ref="logContainer">
      <div v-if="!logs.length" class="log-empty">
        <p>开始缓存后，进度会写在这里</p>
        <p v-if="!side" class="log-empty-sub">日志区域固定高度，不会把页面撑得很长</p>
      </div>
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
  /** 右侧整栏日志（缓存页） */
  side?: boolean
  /** 底部固定高度日志坞 */
  docked?: boolean
  fill?: boolean
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
  padding: 14px 16px 16px;
  border-radius: var(--sa-radius-panel);
  border: 1px solid var(--sa-edge);
  background: var(--sa-panel);
}

.log-panel--side {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px;
  border: 0;
  border-radius: 0;
  background: var(--sa-surface);
}

.log-panel--docked {
  flex-shrink: 0;
  height: min(36vh, 300px);
  min-height: 188px;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 14px;
  border-radius: 0;
  border-left: 0;
  border-right: 0;
  border-bottom: 0;
  margin: 0;
}

.log-panel--fill {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}

.log-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--sa-field);
  border: 1px solid var(--sa-edge);
  font-size: 11px;
  font-weight: 600;
  color: var(--sa-muted);
}

.log-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.log-clear-btn {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}

.log-filter {
  display: flex;
  gap: 2px;
}

.filter-btn {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sa-muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--sa-transition), color var(--sa-transition), border-color var(--sa-transition);
}

.filter-btn:hover:not(.active) {
  background: var(--sa-hover);
  color: var(--sa-ink);
}

.filter-btn.active {
  background: var(--sa-accent);
  border-color: var(--sa-accent);
  color: #fff;
}

.log-search {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--sa-edge);
  background: var(--sa-field);
  color: var(--sa-ink);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  min-width: 120px;
  transition: border-color var(--sa-transition), box-shadow var(--sa-transition);
}

.log-search:focus {
  border-color: var(--sa-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sa-accent) 18%, transparent);
}

.log-content {
  flex: 1;
  min-height: 0;
  max-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 12px;
  border-radius: var(--sa-radius-control);
  background: var(--sa-log);
  border: 1px solid var(--sa-hairline);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.log-panel--docked .log-content,
.log-panel--fill .log-content,
.log-panel--side .log-content {
  max-height: none;
}

.log-empty {
  color: var(--sa-muted);
  text-align: center;
  padding: 20px 8px;
}

.log-empty p {
  margin: 0;
}

.log-empty-sub {
  margin-top: 6px !important;
  font-size: 11px;
  opacity: 0.85;
}

.log-line {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.log-line:last-child {
  margin-bottom: 0;
}

.log-time {
  color: var(--sa-muted);
  flex-shrink: 0;
}

.log-msg {
  word-break: break-word;
  color: var(--sa-ink);
}

.log-line.error .log-msg {
  color: var(--sa-danger);
}

.log-line.success .log-msg {
  color: var(--sa-ok);
}
</style>
