<template>
  <div v-if="isDownloading || progress || result" class="download-progress">
    <div class="progress-header">
      <span>{{ statusText }}</span>
      <span v-if="progress && barPercent > 0" class="percent">{{ Math.round(barPercent) }}%</span>
    </div>
    <div class="bar" role="progressbar" :aria-valuenow="Math.round(barPercent)" aria-valuemin="0" aria-valuemax="100">
      <i :style="{ transform: `scaleX(${Math.min(1, barPercent / 100)})` }" />
    </div>
    <div v-if="progress" class="details">
      <div><span>当前</span><b>{{ progress.file || '处理中' }}</b></div>
      <div v-if="progress.total && progress.total > progress.current">
        <span>媒体</span><b>{{ progress.current || 0 }} / {{ progress.total || 0 }}</b>
      </div>
      <div v-if="postsCount">
        <span>帖子</span><b>{{ postsCount }} 条</b>
      </div>
    </div>
    <p v-if="result" class="result" :class="result.error ? 'is-error' : 'is-ok'">{{ resultMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  isDownloading: boolean
  progress: { percent?: number; file?: string; current?: number; total?: number } | null
  result: { count?: number; skipped?: number; posts?: number; error?: string } | null
  postsCount?: number
}>()

const barPercent = computed(() => {
  if (!props.progress) return 0
  if (props.progress.total && props.progress.total > props.progress.current) {
    return (props.progress.current / props.progress.total) * 100
  }
  return 100
})

const statusText = computed(() => {
  if (props.result?.error) return '出错了'
  if (props.isDownloading) return '正在缓存原创内容…'
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
</script>

<style scoped>
.download-progress {
  padding: 12px 0 4px;
  border-top: 1px solid var(--sa-hairline);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}

.percent {
  color: var(--sa-accent);
  font-size: 15px;
}

.bar {
  height: 4px;
  background: var(--sa-hairline);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  width: 100%;
  transform: scaleX(0);
  transform-origin: left center;
  background: var(--sa-accent);
  transition: transform 0.2s ease-out;
}

.details {
  margin-top: 10px;
  font-size: 13px;
}

.details div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.details span {
  color: var(--sa-muted);
}

.details b {
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.result {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.5;
}

.is-ok {
  color: var(--sa-ok);
}

.is-error {
  color: var(--sa-danger);
}
</style>
