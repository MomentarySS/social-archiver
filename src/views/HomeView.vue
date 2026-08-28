<template>
  <div class="sa-sheet">
    <div class="sa-page home-view">
      <h2>缓存原创</h2>
      <p class="lede">只收该用户自己发的文字和媒体，转发不收。同一目录会增量更新，并刷新 index.html。已存档的账号到浏览页更新即可。</p>

      <PlatformSelector v-model="platform" />

      <UserIdInput v-model="user_id" :platform="platform" />

      <label class="sa-field">
        <span>保存目录</span>
        <div class="sa-row">
          <input class="sa-input" :value="output_dir" readonly placeholder="选择下载目录" />
          <button class="sa-btn sa-btn-ghost" type="button" @click="selectOutputDir">选择</button>
        </div>
      </label>

      <CookieInput v-model="cookie" :platform="platform" />

      <div class="sa-field">
        <span>日期范围（可选，按发帖日，含首尾）</span>
        <div class="sa-row">
          <input
            class="sa-input"
            type="date"
            v-model="startDate"
            :max="endDate || undefined"
            aria-label="起始日期"
          />
          <span class="date-sep">至</span>
          <input
            class="sa-input"
            type="date"
            v-model="endDate"
            :min="startDate || undefined"
            aria-label="结束日期"
          />
        </div>
      </div>

      <div class="sa-row action-row">
        <button
          class="sa-btn sa-btn-primary sa-btn-wide"
          type="button"
          :disabled="isDownloading"
          @click="handleDownload"
        >
          {{ isDownloading ? '缓存中…' : '开始缓存' }}
        </button>
        <button
          v-if="isDownloading"
          class="sa-btn sa-btn-danger"
          type="button"
          @click="handleStop"
        >停止</button>
      </div>

      <DownloadProgress
        :is-downloading="isDownloading"
        :progress="progress"
        :result="result"
        :posts-count="postsCount"
      />

      <LogPanel :logs="logs" @clear="clearLogs" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import PlatformSelector from '../components/PlatformSelector.vue'
import UserIdInput from '../components/UserIdInput.vue'
import CookieInput from '../components/CookieInput.vue'
import DownloadProgress from '../components/DownloadProgress.vue'
import LogPanel from '../components/LogPanel.vue'
import { writeArchiveHtml } from '../utils/archiveHtml.js'
import { appPlatform, setAppPlatform } from '../theme.js'
import { cookieForPlatform, hasUsableCookie, savePlatformCookie, saveUserCookie } from '../utils/session.js'
import { useToast } from '../composables/useToast'
import type { DownloadEvent, ErrorResult, LogEvent } from '../electron-api.d.ts'

interface Progress {
  percent?: number
  file?: string
  current?: number
  total?: number
}

interface Result {
  count?: number
  skipped?: number
  posts?: number
  error?: string
}

interface LogEntry {
  time: string
  msg: string
  type: 'info' | 'error' | 'success'
}

const platform = appPlatform
const user_id = ref('')
const cookie = ref('')
const cookieByPlatform = ref<{ twitter: string; weibo: string; instagram: string }>({ twitter: '', weibo: '', instagram: '' })
const output_dir = ref('')
const startDate = ref('')
const endDate = ref('')
const concurrent = ref(3)
const namingTemplate = ref('{post_id}_{index}')
const isDownloading = ref(false)
const progress = ref<Progress | null>(null)
const result = ref<Result | null>(null)
const postsCount = ref<number | undefined>(undefined)
const logs = ref<LogEntry[]>([])
const cleanupFns: Array<() => void> = []
const settingsReady = ref(false)
const toast = useToast()

function addLog(msg: string, type: 'info' | 'error' | 'success' = 'info') {
  const now = new Date()
  const time = now.toLocaleTimeString('en-US', { hour12: false })
  logs.value.push({ time, msg, type })
}

async function selectOutputDir() {
  try {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectOutputDir()
      if (selected) {
        output_dir.value = selected
        await persistOutputDir(selected)
      }
    }
  } catch (e) {
    console.error('选择目录失败:', e)
    toast.error('打开目录选择器失败')
  }
}

async function handleDownload() {
  if (!user_id.value.trim()) {
    toast.warning('请输入用户ID')
    return
  }

  if (!output_dir.value.trim()) {
    toast.warning('请选择下载目录')
    return
  }

  if (platform.value === 'twitter' && !hasUsableCookie('twitter', cookie.value)) {
    toast.warning('请填写 auth_token。可点「应用内登录 X」，或从 x.com 的 Cookie 里单独复制。')
    return
  }

  if (platform.value === 'weibo' && !hasUsableCookie('weibo', cookie.value)) {
    toast.warning('微博需要包含 SUB 的 Cookie。请先粘贴，或使用应用内登录 / 系统浏览器复制。')
    return
  }

  if (platform.value === 'instagram' && !hasUsableCookie('instagram', cookie.value)) {
    toast.warning('请填写 sessionid。可点「应用内登录 Instagram」，或从 instagram.com 的 Cookie 里复制。')
    return
  }

  // Reset state
  progress.value = null
  result.value = null
  postsCount.value = undefined
  isDownloading.value = true
  logs.value = []

  addLog(`开始缓存${platform.value === 'twitter' ? '推特' : platform.value === 'instagram' ? 'Instagram' : '微博'}用户：${user_id.value}`, 'info')
  await persistOutputDir(output_dir.value)
  await savePlatformCookie(platform.value, cookie.value)
  await saveUserCookie(platform.value, user_id.value.trim(), cookie.value)

  try {
    if (window.electronAPI) {
      const res = await window.electronAPI.startDownload({
        platform: platform.value,
        userId: user_id.value,
        cookie: cookie.value,
        outputDir: output_dir.value,
        startDate: startDate.value || null,
        endDate: endDate.value || null,
        concurrent: concurrent.value,
        namingTemplate: namingTemplate.value,
      })
      
      if (!res.success) {
        addLog(`启动失败：${res.error}`, 'error')
        isDownloading.value = false
      }
    } else {
      addLog('Electron API 不可用（浏览器模式下运行）', 'error')
      isDownloading.value = false
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    addLog(`启动失败：${msg}`, 'error')
    isDownloading.value = false
  }
}

async function handleStop() {
  try {
    if (window.electronAPI) {
      await window.electronAPI.stopDownload()
      addLog('已停止下载', 'info')
      isDownloading.value = false
    }
  } catch (e: unknown) {
    toast.error('停止下载失败')
  }
}

function clearLogs() {
  logs.value = []
}

function formatDoneMessage(event: { count?: number; skipped?: number; posts?: number }) {
  const posts = event.posts ?? 0
  const files = event.count || 0
  const skipped = event.skipped || 0
  if (posts) {
    return `缓存完成：${posts} 条原创（新下载媒体 ${files} 个，跳过 ${skipped} 个）`
  }
  return `缓存完成：新下载媒体 ${files} 个，跳过 ${skipped} 个`
}

async function persistOutputDir(dir: string) {
  if (!dir || !window.electronAPI) return
  try {
    await window.electronAPI.saveSettings({ output_dir: dir })
  } catch (e) { /* ignore */ }
}

async function refreshOfflinePage(userDir?: string) {
  if (!userDir || !window.electronAPI) return
  const dir = userDir
  try {
    const posts = await window.electronAPI.getPosts(dir)
    if (!posts.length) return
    const first = posts[0] || {}
    const res = await writeArchiveHtml({
      userDir: dir,
      posts,
      userName: first.user_name || user_id.value,
      handle: first.screen_name || user_id.value,
      platform: platform.value,
    })
    if (res.success) {
      addLog(`离线页面已更新：${res.path || (dir + '\\index.html')}，可用浏览器打开`, 'success')
    } else {
      addLog(`离线页面未更新：${res.error || '未知错误'}`, 'error')
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    addLog(`离线页面未更新：${msg}`, 'error')
  }
}

async function handleDownloadEvent(event: DownloadEvent) {
  // Discriminated union: narrowing via event.type directly
  if (event.type === 'progress') {
    progress.value = {
      file: event.file,
      percent: event.percent,
      current: event.current,
      total: event.total,
    }
  } else if (event.type === 'done') {
    result.value = {
      count: event.count,
      skipped: event.skipped,
      posts: event.posts,
    }
    isDownloading.value = false
    addLog(formatDoneMessage(event), 'success')
    if (event.output_dir) {
      addLog(`保存位置：${event.output_dir}`, 'success')
    }
    await refreshOfflinePage(event.userDir)
  } else if (event.type === 'error') {
    result.value = { error: event.msg }
    isDownloading.value = false
    addLog(`错误：${event.msg}`, 'error')
    toast.error(event.msg || '下载失败')
  } else if (event.type === 'status') {
    if (event.msg) {
      addLog(event.msg, 'info')
      // 解析微博中间状态「已缓存 N 条原创」提取帖子计数
      const m = event.msg.match(/已缓存\s*(\d+)\s*条原创/)
      if (m) postsCount.value = parseInt(m[1], 10)
    }
  }
}

function setupEventListeners() {
  if (!window.electronAPI) return

  cleanupFns.push(window.electronAPI.onDownloadEvent(handleDownloadEvent))
  cleanupFns.push(window.electronAPI.onDownloadLog((data: LogEvent) => {
    if (data.msg) {
      addLog(data.msg, 'info')
    }
  }))
  cleanupFns.push(window.electronAPI.onDownloadError((data: ErrorResult) => {
    result.value = { error: data.msg }
    isDownloading.value = false
    addLog(`错误：${data.msg}`, 'error')
    toast.error(data.msg || '下载失败')
  }))
}

onMounted(async () => {
  setupEventListeners()
  try {
    if (window.electronAPI) {
      const settings = await window.electronAPI.getSettings()
      if (settings.output_dir && !output_dir.value) {
        output_dir.value = settings.output_dir
      }
      if (settings.last_platform) {
        setAppPlatform(settings.last_platform)
      }
      if (settings.concurrent) {
        concurrent.value = settings.concurrent
      }
      if (settings.naming_template) {
        namingTemplate.value = settings.naming_template
      }
      cookieByPlatform.value = {
        twitter: cookieForPlatform(settings, 'twitter'),
        weibo: cookieForPlatform(settings, 'weibo'),
        instagram: cookieForPlatform(settings, 'instagram'),
      }
      cookie.value = cookieForPlatform(settings, platform.value)
    }
  } catch (e) {
    /* ignore */
  } finally {
    settingsReady.value = true
  }
})

function cookieKeyFor(value: string): 'twitter' | 'weibo' | 'instagram' {
  if (value === 'weibo' || value === 'instagram') return value
  return 'twitter'
}

watch(cookie, (value) => {
  cookieByPlatform.value[cookieKeyFor(platform.value)] = value
})

watch(platform, async (value) => {
  cookie.value = cookieByPlatform.value[cookieKeyFor(value)] || ''
  if (!settingsReady.value || !window.electronAPI) return
  try {
    await window.electronAPI.saveSettings({ last_platform: value })
  } catch (e) { /* ignore */ }
})

onUnmounted(() => {
  cleanupFns.forEach(fn => fn())
})
</script>

<style scoped>
.home-view {
  padding-bottom: 32px;
}

.action-row {
  margin: 8px 0 16px;
}

.date-sep {
  color: var(--sa-muted);
  font-size: 13px;
}
</style>
