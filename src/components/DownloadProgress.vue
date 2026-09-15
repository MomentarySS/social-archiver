<template>
  <div v-if="isDownloading || progress || result" class="download-progress">
    <div class="progress-header">
      <span class="progress-status">{{ statusText }}</span>
      <span v-if="progress && progress.total_known !== false && barPercent > 0" class="percent">{{ Math.round(barPercent) }}%</span>
    </div>
    <div
      class="bar"
      :class="{ 'bar--indeterminate': progress && progress.total_known === false }"
      role="progressbar"
      :aria-valuenow="Math.round(barPercent)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <i :style="{ transform: `scaleX(${Math.min(1, barPercent / 100)})` }" />
    </div>
    <div v-if="progress" class="details">
      <div class="detail-row">
        <span>当前</span>
        <b>{{ progress.file || '处理中' }}</b>
      </div>
      <div v-if="progress.total_known !== false && progress.total && progress.total > (progress.current ?? 0)" class="detail-row">
        <span>媒体</span>
        <b>{{ (progress.current ?? 0) }} / {{ progress.total }}</b>
      </div>
      <div v-else-if="progress.total_known === false" class="detail-row">
        <span>媒体</span>
        <b>已完成 {{ progress.current ?? 0 }} 个</b>
      </div>
      <div v-if="postsCount" class="detail-row">
        <span>帖子</span>
        <b>{{ postsCount }} 条</b>
      </div>
    </div>
    <p v-if="result" class="result" :class="result.error ? 'is-error' : 'is-ok'">{{ resultMessage }}</p>
    <p v-if="fetchStatusHint" class="fetch-hint">{{ fetchStatusHint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  isDownloading: boolean
  progress: { percent?: number; file?: string; current?: number; total?: number; total_known?: boolean } | null
  statusMessage?: string
  result: { count?: number; skipped?: number; posts?: number; error?: string; fetch_status?: string } | null
  postsCount?: number
  fetchStatus?: string
}>()

const barPercent = computed(() => {
  if (!props.progress) return 0
  if (props.progress.total_known === false) return 0
  const cur = props.progress.current ?? 0
  const tot = props.progress.total ?? 0
  if (tot > cur) return (cur / tot) * 100
  return 100
})

const statusText = computed(() => {
  if (props.result?.error) return '出错了'
  if (props.isDownloading) return props.statusMessage || '正在缓存原创内容…'
  if (props.progress) return '处理中…'
  return '准备就绪'
})

const resultMessage = computed(() => {
  if (props.result?.error) return props.result.error
  if (props.result) {
    const posts = props.result.posts
    const files = props.result.count || 0
    const skipped = props.result.skipped || 0
    if (posts) {
      return `完成：缓存 ${posts} 条原创，新下载媒体 ${files} 个，跳过 ${skipped} 个`
    }
    return `完成：新下载媒体 ${files} 个，跳过 ${skipped} 个`
  }
  return ''
})

const fetchStatusHint = computed(() => {
  const status = props.fetchStatus || props.result?.fetch_status || ''
  if (status === 'page_limit') {
    return '仍有更早内容未拉到（已达 200 页上限）。可开启深度回溯后再次运行。'
  }
  if (status === 'partial') {
    return '深度回溯未完成，下次开启深度回溯可从断点继续。'
  }
  return ''
})
</script>

<style scoped>
.download-progress {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: var(--sa-radius-control);
  background: var(--sa-field);
  border: 1px solid var(--sa-edge);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
}

.progress-status {
  font-size: 13px;
  font-weight: 700;
  color: var(--sa-ink);
  max-width: 82%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.percent {
  color: var(--sa-accent);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--sa-hairline);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  width: 100%;
  transform: scaleX(0);
  transform-origin: left center;
  background: linear-gradient(90deg, var(--sa-accent), color-mix(in srgb, var(--sa-accent) 70%, #fff));
  border-radius: 999px;
  transition: transform 0.2s ease-out;
}

.bar--indeterminate i {
  width: 35%;
  transform: translateX(-100%) !important;
  animation: sa-progress-indeterminate 1.4s ease-in-out infinite;
}

@keyframes sa-progress-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(285%); }
}

.details {
  margin-top: 10px;
  font-size: 12px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-row span {
  color: var(--sa-muted);
  flex-shrink: 0;
}

.detail-row b {
  font-weight: 500;
  text-align: right;
  word-break: break-all;
  color: var(--sa-ink);
}

.result {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--sa-hairline);
  font-size: 13px;
  line-height: 1.5;
}

.is-ok {
  color: var(--sa-ok);
}

.is-error {
  color: var(--sa-danger);
}

.fetch-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sa-muted);
}
</style>
