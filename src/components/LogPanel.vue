<template>
  <div class="log-panel">
    <div class="log-header">
      <span>日志</span>
      <button v-if="logs.length" class="sa-btn sa-btn-ghost" type="button" @click="clearLogs">清空</button>
    </div>
    <div class="log-content" ref="logContainer">
      <div v-if="!logs.length" class="log-empty">开始缓存后，进度会写在这里</div>
      <div
        v-for="(log, index) in logs"
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
import { ref, watch, nextTick } from 'vue'

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

watch(() => props.logs.length, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})

function clearLogs() {
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
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
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
