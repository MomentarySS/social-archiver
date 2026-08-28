<template>
  <div class="browse-layout">
    <!-- Left: UserManager panel -->
    <aside class="browse-sidebar">
      <UserManager
        :users="userList"
        :selected-user="selectedUser"
        :output-dir="outputDir"
        :batch-status="batchStatus"
        :batch-running="batchRunning"
        :batch-completed="batchCompleted"
        :batch-total="batchTotal"
        @select-user="handleSelectUser"
        @update-user="handleUpdateUser"
        @delete-user="handleDeleteUser"
        @batch-update="handleBatchUpdate"
        @batch-delete="handleBatchDelete"
        @add-user="handleAddUser"
        @stop-batch="handleStopBatch"
      />
    </aside>

    <!-- Right: Post timeline -->
    <main class="browse-main">
      <header class="browse-bar">
        <div class="bar-left">
          <label class="user-field">
            <span>存档</span>
            <select v-model="selectedUser" :disabled="!users.length" @change="() => loadPosts()">
              <option value="" disabled>{{ users.length ? '选择用户' : '还没有存档' }}</option>
              <option v-for="user in users" :key="user.path" :value="user.path">
                {{ user.displayName || user.name }}
              </option>
            </select>
          </label>
          <button class="ghost-btn" type="button" @click="chooseOutputDir">更换目录</button>
          <button
            v-if="outputDir"
            class="ghost-btn"
            type="button"
            :disabled="loading || updating"
            @click="refreshBrowse"
          >刷新</button>
        </div>
        <div class="bar-right">
          <div
            v-if="posts.length"
            class="sort-toggle"
            role="radiogroup"
            aria-label="时间顺序"
          >
            <button
              type="button"
              role="radio"
              :aria-checked="sortOrder === 'newest'"
              :class="{ active: sortOrder === 'newest' }"
              @click="setSortOrder('newest')"
            >最新在前</button>
            <button
              type="button"
              role="radio"
              :aria-checked="sortOrder === 'oldest'"
              :class="{ active: sortOrder === 'oldest' }"
              @click="setSortOrder('oldest')"
            >最早在前</button>
          </div>
          <span v-if="posts.length" class="post-count">{{ posts.length }} 篇</span>
          <button
            v-if="currentUser"
            class="primary-btn"
            type="button"
            :disabled="updating || exporting"
            @click="updateArchive"
          >
            {{ updating ? '更新中…' : '更新' }}
          </button>
          <button
            v-if="updating"
            class="ghost-btn"
            type="button"
            @click="stopUpdate"
          >停止</button>
          <button
            v-if="posts.length"
            class="primary-btn"
            type="button"
            :disabled="exporting || updating"
            @click="exportHtml"
          >
            {{ exporting ? '导出中…' : '导出离线页' }}
          </button>
        </div>
      </header>

      <div v-if="!outputDir" class="empty-state">
        <p>还没有打开存档目录</p>
        <button class="primary-btn" type="button" @click="chooseOutputDir">选择下载目录</button>
      </div>

      <div v-else-if="loading" class="feed">
        <div class="profile-card skeleton-profile"></div>
        <div v-for="n in 4" :key="n" class="skeleton-post"></div>
      </div>

      <div v-else class="feed">
        <section v-if="currentUser" class="profile-card">
          <div class="cover"></div>
          <div class="profile-main">
            <div class="profile-avatar">
              <img v-if="headerAvatar" :src="headerAvatar" alt="" />
              <span v-else>{{ (currentUser.displayName || currentUser.name).slice(0, 1) }}</span>
            </div>
            <div class="profile-text">
              <h2>{{ currentUser.displayName || currentUser.name }}</h2>
              <p>{{ platformLabel }} / {{ currentUser.name }}</p>
            </div>
          </div>
        </section>
        <div class="feed-gap"></div>

        <div v-if="displayedPosts.length" class="timeline">
          <LazyPost
            v-for="post in displayedPosts"
            :key="`${sortOrder}:${post.id || post.url}`"
            :post="post"
          />
        </div>

        <div v-else class="empty-state inner">
          <p>{{ users.length ? '这个用户还没有可浏览的帖子' : '这个目录里还没有已缓存的用户' }}</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import LazyPost from '../components/LazyPost.vue'
import UserManager from '../components/UserManager.vue'
import { writeArchiveHtml } from '../utils/archiveHtml.js'
import { sortPosts } from '../utils/postTime.js'
import { localAssetUrl } from '../utils/assetUrl.js'
import { PLATFORM_LABELS, normalizePlatform, type Platform } from '../constants'
import { detectPostPlatform } from '../utils/postPlatform.js'
import {
  cookieForPlatform,
  cookieForUser,
  hasUsableCookie,
  savePlatformCookie,
  saveUserCookie,
} from '../utils/session.js'
import { useToast } from '../composables/useToast'
import type { BatchEvent, Post, UserEntry } from '../electron-api.d.ts'

const outputDir = ref('')
const users = ref<UserEntry[]>([])
const selectedUser = ref('')
const posts = ref<Post[]>([])
const loading = ref(false)
const exporting = ref(false)
const updating = ref(false)
const headerAvatar = ref('')
const sortOrder = ref<'newest' | 'oldest'>('newest')
const cleanupFns: Array<() => void> = []
const toast = useToast()

// Batch state
const batchRunning = ref(false)
const batchCompleted = ref(0)
const batchTotal = ref(0)
const batchStatus = ref<{ queued: number; running: boolean; currentUserId?: string; currentPlatform?: string }>({ queued: 0, running: false })

// userList = users with lastUpdate populated from _profile.json
const userList = ref<UserEntry[]>([])

const currentUser = computed(() => users.value.find(u => u.path === selectedUser.value) || null)
const displayedPosts = computed(() => sortPosts(posts.value, sortOrder.value))

function setSortOrder(order: 'newest' | 'oldest') {
  sortOrder.value = order
}

const currentPlatform = computed(() => detectPostPlatform(posts.value[0], currentUser.value))

const platformLabel = computed(() => PLATFORM_LABELS[currentPlatform.value as Platform] || '存档')

watch(currentUser, (user) => {
  headerAvatar.value = user?.avatar ? localAssetUrl(user.avatar) : ''
})

onMounted(async () => {
  setupUpdateListeners()
  setupBatchListeners()
  try {
    if (window.electronAPI) {
      updating.value = await window.electronAPI.isDownloading()
      const settings = await window.electronAPI.getSettings()
      if (settings.output_dir) {
        outputDir.value = settings.output_dir
        await scanUsers()
      }
    }
  } catch (e) { /* ignore */ }
})

onUnmounted(() => {
  cleanupFns.forEach((fn) => fn())
})

async function chooseOutputDir() {
  try {
    if (window.electronAPI) {
      const dir = await window.electronAPI.selectOutputDir()
      if (dir) {
        outputDir.value = dir
        try {
          await window.electronAPI.saveSettings({ output_dir: dir })
        } catch (e) { /* ignore */ }
        await scanUsers()
      }
    }
  } catch (e) {
    toast.error('选择目录失败')
  }
}

async function scanUsers() {
  users.value = []
  selectedUser.value = ''
  posts.value = []
  try {
    if (window.electronAPI) {
      const raw = await window.electronAPI.scanArchives(outputDir.value)
      users.value = raw
      userList.value = raw
      if (users.value.length) {
        selectedUser.value = users.value[0].path
        await loadPosts()
      }
    }
  } catch (e) {
    toast.error('扫描失败')
  }
}

async function loadPosts(opts?: { silent?: boolean }) {
  if (!selectedUser.value) return
  if (!opts?.silent) {
    loading.value = true
    posts.value = []
  }
  try {
    if (window.electronAPI) {
      posts.value = await window.electronAPI.getPosts(selectedUser.value)
    }
  } catch (e) {
    toast.error('加载帖子失败')
  } finally {
    loading.value = false
  }
}

async function refreshBrowse() {
  if (!outputDir.value) return
  try {
    await refreshCurrentArchive(selectedUser.value, { silent: true })
    toast.success('已刷新')
  } catch (e) {
    toast.error('刷新失败')
  }
}

async function loginForPlatform(platform: string) {
  if (!window.electronAPI) return { success: false as const, cookie: '', error: '不可用' }
  if (platform === 'twitter') return window.electronAPI.twitterLogin()
  if (platform === 'instagram') return window.electronAPI.instagramLogin()
  return window.electronAPI.weiboLogin()
}

async function ensureCookie(platform: string, userId: string) {
  const settings = await window.electronAPI!.getSettings()
  let cookie = cookieForUser(settings, platform, userId)
    || cookieForPlatform(settings, platform)
  if (hasUsableCookie(platform, cookie)) return cookie
  toast.info(
    platform === 'twitter' ? '需要登录 X，打开登录窗'
      : platform === 'instagram' ? '需要登录 Instagram，打开登录窗'
      : '需要登录微博，打开登录窗'
  )
  const res = await loginForPlatform(platform)
  if (!res.success || !res.cookie) {
    toast.error(res.error || '登录失败。也可到缓存页或设置页粘贴 Cookie。')
    return ''
  }
  await saveUserCookie(platform, userId, res.cookie)
  await savePlatformCookie(platform, res.cookie)
  return res.cookie
}

async function startUserDownload(user: UserEntry, dates?: { startDate?: string; endDate?: string }) {
  if (!user || !outputDir.value || !window.electronAPI) return
  if (updating.value || await window.electronAPI.isDownloading()) {
    toast.warning('已有缓存任务进行中')
    return
  }
  const userPlatform = normalizePlatform(user.platform, currentPlatform.value)
  const cookie = await ensureCookie(userPlatform, user.name)
  if (!cookie) return
  const settings = await window.electronAPI.getSettings()
  updating.value = true
  try {
    const res = await window.electronAPI.startDownload({
      platform: userPlatform,
      userId: user.name,
      cookie,
      outputDir: outputDir.value,
      startDate: dates?.startDate || null,
      endDate: dates?.endDate || null,
      concurrent: settings.concurrent,
      namingTemplate: settings.naming_template,
    })
    if (!res.success) {
      updating.value = false
      toast.error(res.error || '无法开始更新')
    }
  } catch (e) {
    updating.value = false
    toast.error('无法开始更新')
  }
}

async function updateArchive() {
  const user = currentUser.value
  if (!user) return
  await startUserDownload(user)
}

async function stopUpdate() {
  try {
    await window.electronAPI?.stopDownload()
    updating.value = false
  } catch (e) {
    toast.error('停止失败')
  }
}

function setupUpdateListeners() {
  if (!window.electronAPI) return
  cleanupFns.push(window.electronAPI.onDownloadEvent(async (event: { type?: string; msg?: string; userDir?: string }) => {
    if (event.type === 'done') {
      const fromBrowse = updating.value
      updating.value = false
      await refreshCurrentArchive(event.userDir)
      if (fromBrowse) toast.success('存档已更新')
    } else if (event.type === 'error') {
      updating.value = false
    }
  }))
  cleanupFns.push(window.electronAPI.onDownloadError(() => {
    updating.value = false
  }))
}

// ─── Batch handlers (called from UserManager) ───────────────────
async function handleSelectUser(path: string) {
  selectedUser.value = path
  await loadPosts()
}

async function handleUpdateUser(user: UserEntry) {
  await startUserDownload(user)
}

async function handleDeleteUser(user: UserEntry) {
  if (!window.electronAPI) return
  try {
    const result = await window.electronAPI.deleteArchives([user.path], outputDir.value)
    if (result.success.length) {
      toast.success('已删除存档')
      await scanUsers()
    }
    if (result.failed.length) {
      toast.error(`删除失败: ${result.failed.join(', ')}`)
    }
  } catch (e) {
    toast.error('删除失败')
  }
}

async function handleBatchUpdate(selected: UserEntry[]) {
  if (!selected.length || !window.electronAPI) return
  if (await window.electronAPI.isDownloading()) {
    toast.warning('已有缓存任务进行中')
    return
  }

  const settings = await window.electronAPI.getSettings()
  const jobs = await Promise.all(
    selected.map(async (user) => {
      const platform = normalizePlatform(user.platform, 'weibo')
      const cookie = cookieForUser(settings, platform, user.name)
        || cookieForPlatform(settings, platform)
      if (!hasUsableCookie(platform, cookie)) {
        return null
      }
      return {
        platform,
        userId: user.name,
        cookie,
        outputDir: outputDir.value,
        concurrent: settings.concurrent,
        namingTemplate: settings.naming_template,
      }
    })
  )
  const validJobs = jobs.filter(Boolean) as any[]

  if (validJobs.length < selected.length) {
    toast.warning(`有 ${selected.length - validJobs.length} 个用户缺少 Cookie，已跳过`)
  }
  if (!validJobs.length) {
    toast.error('没有可用的 Cookie，无法开始批量缓存')
    return
  }

  batchRunning.value = true
  batchCompleted.value = 0
  batchTotal.value = validJobs.length
  batchStatus.value = { queued: validJobs.length, running: true }

  try {
    await window.electronAPI.enqueueBatchDownload(validJobs)
  } catch (e) {
    batchRunning.value = false
    toast.error('批量任务启动失败')
  }
}

async function handleBatchDelete(paths: string[]) {
  if (!paths.length || !window.electronAPI) return
  try {
    const result = await window.electronAPI.deleteArchives(paths, outputDir.value)
    if (result.success.length) toast.success(`已删除 ${result.success.length} 个存档`)
    if (result.failed.length) toast.error(`删除失败: ${result.failed.join(', ')}`)
    await scanUsers()
  } catch (e) {
    toast.error('批量删除失败')
  }
}

async function handleAddUser(data: { platform: string; userId: string; cookie: string; startDate?: string; endDate?: string }) {
  if (!window.electronAPI) return
  if (!outputDir.value) {
    toast.warning('请先选择存档目录')
    return
  }
  const settings = await window.electronAPI.getSettings()

  await saveUserCookie(data.platform, data.userId, data.cookie)
  await savePlatformCookie(data.platform, data.cookie)

  const existing = users.value.find(
    (u) => u.name === data.userId && (u.platform || 'twitter') === data.platform
  )
  if (existing) {
    toast.info('该用户已存在，开始更新…')
    selectedUser.value = existing.path
    await loadPosts()
    await startUserDownload(existing, { startDate: data.startDate, endDate: data.endDate })
    return
  }

  updating.value = true
  batchRunning.value = false
  try {
    const res = await window.electronAPI.startDownload({
      platform: data.platform,
      userId: data.userId,
      cookie: data.cookie,
      outputDir: outputDir.value,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      concurrent: settings.concurrent,
      namingTemplate: settings.naming_template,
    })
    if (!res.success) {
      updating.value = false
      toast.error(res.error || '无法开始缓存')
    }
  } catch (e) {
    updating.value = false
    toast.error('无法开始缓存')
  }
}

function setupBatchListeners() {
  if (!window.electronAPI) return
  cleanupFns.push(
    window.electronAPI.onBatchEvent(async (event: BatchEvent) => {
      if (event.type === 'done' && event.userDir) {
        await refreshCurrentArchive(event.userDir)
        return
      }
      if (event.type === 'user-start' || event.type === 'user-done' || event.type === 'user-error') {
        batchStatus.value = {
          queued: typeof event.queued === 'number' ? event.queued : batchStatus.value.queued,
          running: true,
          currentUserId: event.userId,
          currentPlatform: event.platform,
        }
        if (event.type === 'user-done' || event.type === 'user-error') {
          batchCompleted.value++
          if (event.userDir) await refreshCurrentArchive(event.userDir)
        }
        return
      }
      if (event.type === 'batch-done') {
        batchRunning.value = false
        batchCompleted.value = 0
        batchTotal.value = 0
        batchStatus.value = { queued: 0, running: false }
        toast.success('批量缓存全部完成')
        return
      }
      if (event.type === 'batch-stopped') {
        batchRunning.value = false
        batchCompleted.value = 0
        batchTotal.value = 0
        batchStatus.value = { queued: 0, running: false }
        toast.info('已停止批量缓存')
      }
    })
  )
}

async function handleStopBatch() {
  try {
    await window.electronAPI?.stopBatchDownload()
  } catch (e) {
    toast.error('停止失败')
  }
}

async function refreshCurrentArchive(userDir?: string, opts?: { silent?: boolean }) {
  if (!window.electronAPI || !outputDir.value) return
  const keep = userDir || selectedUser.value
  const api = window.electronAPI
  try {
    const raw = await api.scanArchives(outputDir.value)
    users.value = raw
    userList.value = raw
    if (keep && users.value.some((u) => u.path === keep)) {
      selectedUser.value = keep
    }
    await loadPosts({ silent: opts?.silent })
  } catch (e) { /* ignore */ }
}

async function exportHtml() {
  if (!posts.value.length || !selectedUser.value) {
    toast.warning('没有可导出的内容')
    return
  }
  exporting.value = true
  try {
    const user = currentUser.value
    const res = await writeArchiveHtml({
      userDir: selectedUser.value,
      posts: posts.value,
      userName: user?.displayName || user?.name || 'user',
      handle: user?.name || '',
      platform: currentPlatform.value,
    })
    if (res.success) {
      toast.success('离线页面已生成，正在打开文件夹...')
      await window.electronAPI?.openFolder(selectedUser.value)
    } else {
      toast.error(`导出失败: ${res.error}`)
    }
  } catch (e) {
    toast.error('导出失败')
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.browse-layout {
  display: flex;
  min-height: calc(100vh - 58px);
  background: var(--sa-bg);
  color: var(--sa-ink);
}

.browse-sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--sa-edge);
  overflow-y: auto;
  max-height: calc(100vh - 58px);
  position: sticky;
  top: 58px;
}

.browse-main {
  flex: 1;
  min-width: 0;
}

.browse-bar {
  position: sticky;
  top: 58px;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 16px;
  backdrop-filter: blur(12px);
  background: var(--sa-bar-bg);
  border-bottom: 1px solid var(--sa-edge);
}

.bar-left,
.bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sort-toggle {
  display: flex;
  gap: 4px;
  position: relative;
  z-index: 2;
}

.sort-toggle button {
  height: 32px;
  border-radius: 999px;
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--sa-edge);
  background: transparent;
  color: var(--sa-muted);
}

.sort-toggle button.active {
  background: var(--sa-accent);
  border-color: var(--sa-accent);
  color: #fff;
}

.user-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.user-field select {
  min-width: 180px;
  height: 32px;
  border-radius: 999px;
  padding: 0 12px;
  font: inherit;
  border: 1px solid var(--sa-edge);
  background: var(--sa-field);
  color: var(--sa-ink);
}

.ghost-btn,
.primary-btn {
  height: 32px;
  border-radius: 999px;
  padding: 0 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ghost-btn {
  background: transparent;
  border: 1px solid var(--sa-edge);
  color: var(--sa-ink);
}

.primary-btn {
  border: 0;
  color: #fff;
  background: var(--sa-accent);
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.post-count {
  font-size: 13px;
  color: var(--sa-muted);
}

.feed {
  max-width: 600px;
  margin: 0 auto;
  min-height: 70vh;
  background: var(--sa-surface);
  box-shadow: var(--sa-feed-shadow);
  border-inline: var(--sa-feed-border);
}

.profile-card {
  position: relative;
}

.cover {
  height: 120px;
  background: var(--sa-cover);
}

.profile-main {
  display: flex;
  gap: 12px;
  padding: 0 16px 16px;
  align-items: flex-end;
}

.profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  margin-top: -28px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--sa-avatar);
  color: #fff;
  border: 3px solid var(--sa-surface);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-text {
  padding-bottom: 4px;
}

.profile-text h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.profile-text p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--sa-muted);
}

.feed-gap {
  height: 8px;
  background: var(--sa-bg);
}

.skeleton-profile,
.skeleton-post {
  background: var(--sa-log);
}

.skeleton-profile {
  height: 180px;
}

.skeleton-post {
  height: 120px;
  margin: 12px 16px;
  border-radius: 0;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
}

.empty-state p {
  margin-bottom: 16px;
  color: var(--sa-muted);
}

.empty-state.inner {
  padding: 48px 20px;
}
</style>
