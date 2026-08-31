<template>
  <div class="browse-hub">
    <header class="hub-header">
      <h2>存档概览</h2>
      <p class="hub-lede">选择账号后才会加载帖子内容。</p>
    </header>

    <div v-if="loading" class="hub-loading">
      <div v-for="n in 3" :key="n" class="hub-skeleton"></div>
    </div>

    <template v-else-if="stats">
      <div class="hub-summary">
        <span>{{ userCountLabel }}</span>
        <span class="hub-dot">·</span>
        <span>{{ stats.totalPosts }} 篇帖子</span>
        <span class="hub-dot">·</span>
        <span>{{ stats.totalMedia }} 个媒体</span>
        <span class="hub-dot">·</span>
        <span>{{ stats.totalBytesLabel }}</span>
      </div>

      <div class="hub-list">
        <button
          v-if="users.length > 1"
          type="button"
          class="hub-card hub-card-all"
          @click="emit('enter-user', allUsersValue)"
        >
          <div class="hub-card-main">
            <span class="hub-card-title">全部用户</span>
            <span class="hub-card-sub">跨账号统一时间线（只读）</span>
          </div>
          <span class="hub-card-meta">{{ users.length }} 个账号 · {{ stats.totalPosts }} 篇帖子</span>
        </button>

        <button
          v-for="entry in hubEntries"
          :key="entry.path"
          type="button"
          class="hub-card"
          @click="emit('enter-user', entry.path)"
        >
          <span class="hub-platform" :class="`plat-${entry.platform || 'unknown'}`">
            {{ platformLabel(entry.platform) }}
          </span>
          <div class="hub-card-main">
            <span class="hub-card-title">{{ entry.displayName || entry.name }}</span>
            <span class="hub-card-sub">@{{ entry.name }}</span>
          </div>
          <span class="hub-card-meta">{{ entry.metaLabel }}</span>
        </button>
      </div>
    </template>

    <div v-else-if="!users.length" class="hub-empty">
      <p>这个目录里还没有已缓存的用户</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PLATFORM_LABELS, normalizePlatform, type Platform } from '../constants'
import type { ArchiveStats, UserEntry, UserStats } from '../electron-api.d.ts'

const props = defineProps<{
  users: UserEntry[]
  stats: ArchiveStats | null
  loading: boolean
  allUsersValue: string
}>()

const emit = defineEmits<{
  (e: 'enter-user', path: string): void
}>()

const userCountLabel = computed(() => {
  const n = props.users.length
  return `${n} 个账号`
})

interface HubEntry extends UserEntry {
  metaLabel: string
}

const hubEntries = computed<HubEntry[]>(() => {
  const statsByDir = new Map<string, UserStats>()
  for (const stat of props.stats?.users || []) {
    statsByDir.set(stat.userDir, stat)
  }
  return props.users.map((user) => {
    const stat = statsByDir.get(user.path)
    const parts: string[] = []
    if (stat) {
      parts.push(`${stat.postCount} 帖`)
      parts.push(`${stat.mediaCount} 个媒体`)
      if (stat.earliestDate && stat.latestDate) {
        parts.push(`${stat.earliestDate} ~ ${stat.latestDate}`)
      } else if (stat.lastUpdate) {
        parts.push(`更新 ${formatLastUpdate(stat.lastUpdate)}`)
      }
    } else if (user.lastUpdate) {
      parts.push(`更新 ${formatLastUpdate(user.lastUpdate)}`)
    }
    return {
      ...user,
      metaLabel: parts.length ? parts.join(' · ') : '暂无统计',
    }
  })
})

function platformLabel(platform?: string) {
  const key = normalizePlatform(platform, 'weibo')
  return PLATFORM_LABELS[key as Platform] || '存档'
}

function formatLastUpdate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return d.toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.browse-hub {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px 16px 32px;
  background: var(--sa-surface);
  box-shadow: var(--sa-feed-shadow);
  border-inline: var(--sa-feed-border);
  min-height: calc(100vh - 58px - 49px);
}

.hub-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.hub-lede {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--sa-muted);
  line-height: 1.5;
}

.hub-summary {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: var(--sa-radius-panel);
  border: 1px solid var(--sa-edge);
  background: var(--sa-field);
  font-size: 13px;
  color: var(--sa-muted);
  line-height: 1.5;
}

.hub-dot {
  margin: 0 4px;
}

.hub-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hub-card {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'badge main'
    'badge meta';
  gap: 2px 10px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--sa-edge);
  border-radius: var(--sa-radius-panel);
  background: var(--sa-field);
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
  transition: background var(--sa-transition), border-color var(--sa-transition), transform 0.1s ease;
}

.hub-card:hover {
  background: var(--sa-hover);
  border-color: color-mix(in srgb, var(--sa-edge) 60%, var(--sa-muted));
}

.hub-card:active {
  transform: scale(0.995);
}

.hub-card-all {
  grid-template-columns: 1fr;
  grid-template-areas:
    'main'
    'meta';
}

.hub-platform {
  grid-area: badge;
  align-self: start;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.plat-weibo { background: #ff8200; }
.plat-twitter { background: #1d9bf0; }
.plat-instagram { background: #e1306c; }
.plat-unknown { background: var(--sa-muted); }

.hub-card-main {
  grid-area: main;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hub-card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--sa-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-card-sub {
  font-size: 12px;
  color: var(--sa-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-card-meta {
  grid-area: meta;
  font-size: 12px;
  color: var(--sa-muted);
  line-height: 1.4;
}

.hub-card-all .hub-card-meta {
  margin-top: 4px;
}

.hub-loading {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hub-skeleton {
  height: 72px;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--sa-field) 25%, var(--sa-edge) 50%, var(--sa-field) 75%);
  background-size: 200% 100%;
  animation: hub-shimmer 1.2s infinite;
}

@keyframes hub-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.hub-empty {
  margin-top: 24px;
  text-align: center;
  color: var(--sa-muted);
  font-size: 14px;
}
</style>
