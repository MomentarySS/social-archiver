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
        :user-schedules="userSchedules"
        @select-user="handleSelectUser"
        @update-user="handleUpdateUser"
        @delete-user="handleDeleteUser"
        @batch-update="handleBatchUpdate"
        @batch-delete="handleBatchDelete"
        @add-user="handleAddUser"
        @stop-batch="handleStopBatch"
        @update-schedule="handleUpdateSchedule"
      />
      <BrowseCalendar
        v-if="isUserMode && posts.length"
        v-model="calendarDate"
        :posts="posts"
      />
    </aside>

    <!-- Right: Post timeline -->
    <main class="browse-main">
      <header class="browse-bar">
        <div class="bar-row bar-primary">
          <div class="bar-left">
            <button
              v-if="isUserMode"
              class="sa-pill-btn sa-pill-btn--ghost"
              type="button"
              @click="resetToHub"
            >返回概览</button>
            <span v-else-if="outputDir" class="hub-label">存档概览</span>
            <label v-if="isUserMode" class="user-field">
              <span>存档</span>
              <select v-model="selectedUser" :disabled="!users.length" @change="onUserSelectChange">
                <option value="" disabled>{{ users.length ? '选择用户' : '还没有存档' }}</option>
                <option v-if="users.length > 1" :value="ALL_USERS_VALUE">全部用户（只读）</option>
                <option v-for="user in users" :key="user.path" :value="user.path">
                  {{ user.displayName || user.name }}
                </option>
              </select>
            </label>
            <button class="sa-pill-btn sa-pill-btn--ghost" type="button" @click="chooseOutputDir">更换目录</button>
            <button
              v-if="outputDir"
              class="sa-pill-btn sa-pill-btn--ghost"
              type="button"
              :disabled="loading || updating || statsLoading"
              @click="refreshBrowse"
            >刷新</button>
          </div>
          <div class="bar-actions">
            <label
              v-if="isUserMode && showWeiboUpdateOptions"
              class="bar-check"
              title="忽略「连续已缓存即停」，从断点继续拉更早微博"
            >
              <input v-model="deepBacktrack" type="checkbox" />
              <span>深度回溯</span>
            </label>
            <button
              v-if="isUserMode && currentUser && !isAllUsersMode"
              class="sa-pill-btn sa-pill-btn--primary"
              type="button"
              :disabled="updating || exporting"
              @click="updateArchive"
            >
              {{ updating ? '更新中…' : '更新' }}
            </button>
            <button
              v-if="isUserMode && updating"
              class="sa-pill-btn sa-pill-btn--ghost"
              type="button"
              @click="stopUpdate"
            >停止</button>
            <div
              v-if="isUserMode && posts.length && !isAllUsersMode"
              ref="exportMenuRef"
              class="bar-menu"
            >
              <button
                class="sa-pill-btn sa-pill-btn--ghost"
                type="button"
                :disabled="exporting || updating"
                aria-haspopup="menu"
                :aria-expanded="exportMenuOpen"
                @click.stop="exportMenuOpen = !exportMenuOpen"
              >
                {{ exporting ? '导出中…' : '导出' }}
              </button>
              <div v-if="exportMenuOpen" class="bar-menu-panel" role="menu" @click.stop>
                <button type="button" role="menuitem" :disabled="exporting || updating" @click="runExport('markdown')">
                  Markdown
                </button>
                <button type="button" role="menuitem" :disabled="exporting || updating" @click="runExport('rss')">
                  RSS
                </button>
                <button type="button" role="menuitem" :disabled="exporting || updating" @click="runExport('json')">
                  JSON
                </button>
                <button type="button" role="menuitem" :disabled="exporting || updating" @click="runExport('html')">
                  离线 HTML
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="outputDir" class="bar-row bar-filters">
          <div class="search-box">
            <input
              v-model="searchQuery"
              class="search-input"
              type="search"
              placeholder="搜索存档…"
              aria-label="搜索存档"
              @keydown.enter.prevent="runSearch"
            />
            <button class="sa-pill-btn sa-pill-btn--ghost" type="button" :disabled="searching" @click="runSearch">
              {{ searching ? '…' : '搜' }}
            </button>
          </div>
          <div v-if="isUserMode && posts.length" class="date-filter">
            <input
              v-model="filterStartDate"
              class="date-input"
              type="date"
              :max="filterEndDate || undefined"
              aria-label="筛选起始日期"
            />
            <span class="date-sep">–</span>
            <input
              v-model="filterEndDate"
              class="date-input"
              type="date"
              :min="filterStartDate || undefined"
              aria-label="筛选结束日期"
            />
            <button
              v-if="filterStartDate || filterEndDate"
              class="sa-pill-btn sa-pill-btn--ghost"
              type="button"
              @click="clearDateFilter"
            >清除</button>
          </div>
          <div
            v-if="isUserMode && posts.length"
            class="view-toggle"
            role="tablist"
            aria-label="浏览视图"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="viewMode === 'timeline'"
              :class="{ active: viewMode === 'timeline' }"
              @click="viewMode = 'timeline'"
            >时间线</button>
            <button
              type="button"
              role="tab"
              :aria-selected="viewMode === 'gallery'"
              :class="{ active: viewMode === 'gallery' }"
              @click="viewMode = 'gallery'"
            >画廊</button>
          </div>
          <div
            v-if="isUserMode && posts.length"
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
          <span v-if="isUserMode && posts.length" class="post-count">{{ postCountLabel }}</span>
          <div v-if="isUserMode && hashtagOptions.length" class="hashtag-filter">
            <button
              class="sa-pill-btn sa-pill-btn--ghost"
              type="button"
              :class="{ active: !selectedHashtag }"
              @click="selectedHashtag = ''"
            >全部话题</button>
            <button
              v-for="item in hashtagOptions.slice(0, 12)"
              :key="item.tag"
              class="sa-pill-btn sa-pill-btn--ghost"
              type="button"
              :class="{ active: selectedHashtag === item.tag }"
              @click="selectedHashtag = item.tag"
            >#{{ item.tag }} ({{ item.count }})</button>
          </div>
        </div>
      </header>

      <div v-if="searchResults.length" class="search-results">
        <div class="search-results-head">
          <span>找到 {{ searchResults.length }} 条</span>
          <button class="sa-pill-btn sa-pill-btn--ghost" type="button" @click="clearSearch">清除</button>
        </div>
        <button
          v-for="hit in searchResults"
          :key="`${hit.userDir}:${hit.postId}`"
          type="button"
          class="search-hit"
          @click="openSearchHit(hit)"
        >
          <span class="hit-user">{{ hit.userName }} · {{ hit.postId }}</span>
          <span class="hit-snippet" v-html="snippetHtml(hit)"></span>
        </button>
      </div>

      <div v-if="!outputDir" class="empty-state">
        <p>还没有打开存档目录</p>
        <button class="sa-pill-btn sa-pill-btn--primary" type="button" @click="chooseOutputDir">选择下载目录</button>
      </div>

      <BrowseHub
        v-else-if="isHubMode"
        :users="users"
        :stats="archiveStats"
        :loading="statsLoading"
        :all-users-value="ALL_USERS_VALUE"
        @enter-user="enterUser"
      />

      <div v-else-if="loading" class="feed">
        <div class="profile-card skeleton-profile"></div>
        <div v-for="n in 4" :key="n" class="skeleton-post"></div>
      </div>

      <div v-else class="feed">
        <section v-if="isAllUsersMode" class="profile-card profile-card-all">
          <div class="profile-main">
            <div class="profile-text">
              <h2>全部用户</h2>
              <p>跨账号统一时间线（只读）· {{ users.length }} 个账号 · {{ posts.length }} 篇帖子</p>
            </div>
          </div>
        </section>
        <section v-else-if="currentUser" class="profile-card">
          <div class="profile-main">
            <div class="profile-avatar">
              <img v-if="headerAvatar" :src="headerAvatar" alt="" />
              <span v-else>{{ (currentUser.displayName || currentUser.name).slice(0, 1) }}</span>
            </div>
            <div class="profile-text">
              <h2>{{ currentUser.displayName || currentUser.name }}</h2>
              <p>{{ platformLabel }} / {{ currentUser.name }}</p>
              <p v-if="userStats" class="profile-stats">
                {{ userStats.postCount }} 帖 · {{ userStats.mediaCount }} 个媒体 · {{ formatBytes(userStats.mediaBytes) }}
                <span v-if="userStats.earliestDate"> · {{ userStats.earliestDate }} ~ {{ userStats.latestDate }}</span>
              </p>
            </div>
          </div>
        </section>
        <div class="feed-gap"></div>

        <div v-if="viewMode === 'gallery' && displayedPosts.length" class="timeline">
          <MediaGallery :posts="displayedPosts" @open-post="openPostFromGallery" />
        </div>
        <div v-else-if="displayedPosts.length" class="timeline">
          <LazyPost
            v-for="post in displayedPosts"
            :key="`${sortOrder}:${post.id || post.url}`"
            :post="post"
            :anchor-id="postAnchorId(post)"
            :highlight-query="activeHighlightQuery"
          />
        </div>

        <div v-else class="empty-state inner">
          <p v-if="posts.length">当前筛选条件下没有帖子</p>
          <p v-else-if="users.length">这个用户还没有可浏览的帖子</p>
          <p v-else>这个目录里还没有已缓存的用户</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BrowseHub from '../components/BrowseHub.vue'
import BrowseCalendar from '../components/BrowseCalendar.vue'
import LazyPost from '../components/LazyPost.vue'
import MediaGallery from '../components/MediaGallery.vue'
import UserManager from '../components/UserManager.vue'
import { writeArchiveHtml } from '../utils/archiveHtml.js'
import { sortPosts, filterPostsByDate } from '../utils/postTime.js'
import { collectHashtagsFromPosts, filterPostsByHashtag } from '../utils/hashtags.js'
import { highlightSnippet } from '../utils/highlight.ts'
import { OPEN_POST_EVENT, type OpenPostDetail } from '../utils/navBus.ts'
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
import type { ArchiveStats, BatchEvent, Post, SearchHit, UserEntry, UserScheduleMode, UserStats } from '../electron-api.d.ts'

const props = defineProps<{
  active?: boolean
}>()

const ALL_USERS_VALUE = '__all__'
const COOKIE_VALID_TTL_MS = 30 * 60 * 1000

const outputDir = ref('')
const users = ref<UserEntry[]>([])
const selectedUser = ref('')
const posts = ref<Post[]>([])
const loading = ref(false)
const statsLoading = ref(false)
const browseMode = ref<'hub' | 'user'>('hub')
const archiveStats = ref<ArchiveStats | null>(null)
const exporting = ref(false)
const updating = ref(false)
const headerAvatar = ref('')
const sortOrder = ref<'newest' | 'oldest'>('newest')
const viewMode = ref<'timeline' | 'gallery'>('timeline')
const userStats = ref<UserStats | null>(null)
const userSchedules = ref<Record<string, UserScheduleMode>>({})
const cleanupFns: Array<() => void> = []
const toast = useToast()

// Batch state
const batchRunning = ref(false)
const batchCompleted = ref(0)
const batchTotal = ref(0)
const batchStatus = ref<{ queued: number; running: boolean; currentUserId?: string; currentPlatform?: string }>({ queued: 0, running: false })

const searchQuery = ref('')
const searchResults = ref<SearchHit[]>([])
const searching = ref(false)
const pendingHash = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')
const calendarDate = ref('')
const selectedHashtag = ref('')
const activeHighlightQuery = ref('')
const exportMenuOpen = ref(false)
const exportMenuRef = ref<HTMLElement | null>(null)
const deepBacktrack = ref(false)

// userList = users with lastUpdate populated from _profile.json
const userList = ref<UserEntry[]>([])

const currentUser = computed(() => users.value.find(u => u.path === selectedUser.value) || null)
const isHubMode = computed(() => browseMode.value === 'hub')
const isUserMode = computed(() => browseMode.value === 'user')
const isAllUsersMode = computed(() => selectedUser.value === ALL_USERS_VALUE)
const showWeiboUpdateOptions = computed(() => {
  if (isAllUsersMode.value || !currentUser.value) return false
  return normalizePlatform(currentUser.value.platform, 'weibo') === 'weibo'
})
const filteredPosts = computed(() => {
  let list = filterPostsByDate(posts.value, filterStartDate.value, filterEndDate.value)
  list = filterPostsByHashtag(list, selectedHashtag.value)
  return list
})
const hashtagOptions = computed(() => collectHashtagsFromPosts(posts.value))
const displayedPosts = computed(() => sortPosts(filteredPosts.value, sortOrder.value, { allUsers: isAllUsersMode.value }))
const postCountLabel = computed(() => {
  const total = posts.value.length
  const shown = displayedPosts.value.length
  if (((filterStartDate.value || filterEndDate.value) || selectedHashtag.value) && shown !== total) {
    return `${shown} / ${total} 篇`
  }
  return `${total} 篇`
})

function setSortOrder(order: 'newest' | 'oldest') {
  sortOrder.value = order
}

watch(selectedUser, () => {
  deepBacktrack.value = false
  selectedHashtag.value = ''
})

watch(userStats, (stats) => {
  if (!showWeiboUpdateOptions.value) return
  const status = stats?.fetchStatus || ''
  if (status === 'partial' || status === 'page_limit') {
    deepBacktrack.value = true
  }
})

function closeExportMenu() {
  exportMenuOpen.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (!exportMenuOpen.value) return
  const root = exportMenuRef.value
  if (root && !root.contains(event.target as Node)) {
    closeExportMenu()
  }
}

async function runExport(kind: 'markdown' | 'rss' | 'json' | 'html') {
  closeExportMenu()
  if (kind === 'markdown') await exportMarkdown()
  else if (kind === 'rss') await exportRss()
  else if (kind === 'json') await exportJson()
  else await exportHtml()
}

const currentPlatform = computed(() => detectPostPlatform(posts.value[0], currentUser.value))

const platformLabel = computed(() => PLATFORM_LABELS[currentPlatform.value as Platform] || '存档')

watch(selectedUser, () => {
  activeHighlightQuery.value = ''
  closeExportMenu()
})

watch(currentUser, async (user) => {
  headerAvatar.value = user?.avatar ? localAssetUrl(user.avatar) : ''
  await loadUserStats()
})

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

async function loadUserSchedules() {
  if (!window.electronAPI) return
  const settings = await window.electronAPI.getSettings()
  const raw = settings.user_schedules || {}
  const next: Record<string, UserScheduleMode> = {}
  for (const [key, value] of Object.entries(raw)) {
    next[key] = value === 'daily' || value === 'weekly' ? value : 'manual'
  }
  userSchedules.value = next
}

async function loadUserStats() {
  userStats.value = null
  if (!selectedUser.value || !window.electronAPI) return
  try {
    userStats.value = await window.electronAPI.getUserStats(selectedUser.value)
  } catch (e) { /* ignore */ }
}

async function handleUpdateSchedule(payload: { platform: string; userId: string; schedule: string }) {
  if (!window.electronAPI) return
  const key = `${payload.platform}:${payload.userId}`
  const schedule: UserScheduleMode = payload.schedule === 'daily' || payload.schedule === 'weekly'
    ? payload.schedule
    : 'manual'
  userSchedules.value = { ...userSchedules.value, [key]: schedule }
  await window.electronAPI.saveSettings({ user_schedules: { [key]: schedule } })
}

function openPostFromGallery(postId: string) {
  if (!postId) return
  viewMode.value = 'timeline'
  const anchor = `post-${postId}`
  window.location.hash = anchor
  scrollToPostFromHash()
}

function postAnchorId(post: Post) {
  const id = String(post.id || '').trim()
  return id ? `post-${id}` : ''
}

function scrollToPostFromHash() {
  const hash = (window.location.hash || '').replace(/^#/, '')
  if (!hash) return
  pendingHash.value = hash
  requestAnimationFrame(() => {
    const el = document.getElementById(hash)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      pendingHash.value = ''
    }
  })
}

function clearDateFilter() {
  filterStartDate.value = ''
  filterEndDate.value = ''
  calendarDate.value = ''
}

watch([filterStartDate, filterEndDate], ([start, end]) => {
  if (start && start === end) {
    calendarDate.value = start
  } else if (!start && !end) {
    calendarDate.value = ''
  } else {
    calendarDate.value = ''
  }
})

watch(calendarDate, (value) => {
  if (!value) return
  filterStartDate.value = value
  filterEndDate.value = value
})

function snippetHtml(hit: SearchHit) {
  return highlightSnippet(hit.snippet || '', searchQuery.value)
}

async function runSearch() {
  const q = searchQuery.value.trim()
  if (!q || !outputDir.value || !window.electronAPI) return
  searching.value = true
  try {
    const res = await window.electronAPI.searchArchives({ outputDir: outputDir.value, query: q })
    if (res.error) {
      toast.error(res.error)
      searchResults.value = []
      return
    }
    searchResults.value = res.hits || []
    if (!searchResults.value.length) toast.info('没有匹配的帖子')
  } catch (e) {
    toast.error('搜索失败')
  } finally {
    searching.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
  activeHighlightQuery.value = ''
}

async function openSearchHit(hit: SearchHit) {
  activeHighlightQuery.value = searchQuery.value.trim()
  browseMode.value = 'user'
  selectedUser.value = hit.userDir
  await loadPosts()
  const anchor = `post-${hit.postId}`
  window.location.hash = anchor
  scrollToPostFromHash()
  searchResults.value = []
}

async function openPostFromNav(detail: OpenPostDetail) {
  if (!detail?.userDir || !detail.postId) return
  activeHighlightQuery.value = detail.highlightQuery || ''
  browseMode.value = 'user'
  selectedUser.value = detail.userDir
  await loadPosts()
  const anchor = `post-${detail.postId}`
  window.location.hash = anchor
  scrollToPostFromHash()
}

function onOpenPostEvent(event: Event) {
  const detail = (event as CustomEvent<OpenPostDetail>).detail
  if (detail) void openPostFromNav(detail)
}

function resetToHub() {
  browseMode.value = 'hub'
  selectedUser.value = ''
  posts.value = []
  loading.value = false
  activeHighlightQuery.value = ''
  selectedHashtag.value = ''
  calendarDate.value = ''
  filterStartDate.value = ''
  filterEndDate.value = ''
  closeExportMenu()
  window.location.hash = ''
}

async function enterUser(path: string) {
  if (!path) return
  browseMode.value = 'user'
  selectedUser.value = path
  await loadPosts()
}

function onUserSelectChange() {
  if (!selectedUser.value) return
  browseMode.value = 'user'
  void loadPosts()
}

async function loadArchiveStats() {
  archiveStats.value = null
  if (!outputDir.value || !window.electronAPI) return
  statsLoading.value = true
  try {
    archiveStats.value = await window.electronAPI.getArchiveStats(outputDir.value)
  } catch (e) { /* ignore */ }
  finally {
    statsLoading.value = false
  }
}

watch(() => props.active, (isActive, wasActive) => {
  if (isActive && wasActive === false && browseMode.value === 'hub' && outputDir.value) {
    void loadArchiveStats()
  }
})

onMounted(async () => {
  setupUpdateListeners()
  setupBatchListeners()
  window.addEventListener('hashchange', scrollToPostFromHash)
  window.addEventListener(OPEN_POST_EVENT, onOpenPostEvent as EventListener)
  window.addEventListener('click', onDocumentClick)
  try {
    if (window.electronAPI) {
      updating.value = await window.electronAPI.isDownloading()
      const settings = await window.electronAPI.getSettings()
      if (settings.output_dir) {
        outputDir.value = settings.output_dir
        await loadUserSchedules()
        await scanUsers()
      }
    }
  } catch (e) { /* ignore */ }
})

onUnmounted(() => {
  window.removeEventListener('hashchange', scrollToPostFromHash)
  window.removeEventListener(OPEN_POST_EVENT, onOpenPostEvent as EventListener)
  window.removeEventListener('click', onDocumentClick)
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
  browseMode.value = 'hub'
  try {
    if (window.electronAPI) {
      const raw = await window.electronAPI.scanArchives(outputDir.value)
      users.value = raw
      userList.value = raw
      await loadArchiveStats()
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
      if (selectedUser.value === ALL_USERS_VALUE) {
        if (!outputDir.value) {
          posts.value = []
          return
        }
        posts.value = await window.electronAPI.getAllPosts(outputDir.value)
      } else {
        posts.value = await window.electronAPI.getPosts(selectedUser.value)
      }
    }
  } catch (e) {
    toast.error('加载帖子失败')
  } finally {
    loading.value = false
    if (!isAllUsersMode.value) {
      await loadUserStats()
    } else {
      userStats.value = null
    }
    scrollToPostFromHash()
  }
}

async function refreshBrowse() {
  if (!outputDir.value) return
  try {
    if (isUserMode.value && selectedUser.value) {
      await refreshCurrentArchive(selectedUser.value, { silent: true })
    } else {
      const raw = await window.electronAPI?.scanArchives(outputDir.value)
      if (raw) {
        users.value = raw
        userList.value = raw
      }
      await loadArchiveStats()
    }
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
  if (hasUsableCookie(platform, cookie) && window.electronAPI) {
    const fresh = await window.electronAPI.isCookieRecentlyValidated({
      platform,
      userId,
      cookie,
      ttlMs: COOKIE_VALID_TTL_MS,
    })
    if (fresh) return cookie

    const check = await window.electronAPI.checkCookie({ platform, cookie, userId })
    if (check.valid) {
      await window.electronAPI.markCookieValid({ platform, userId, cookie })
      return cookie
    }
  }
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
  const check = await window.electronAPI!.checkCookie({ platform, cookie: res.cookie, userId })
  if (!check.valid) {
    toast.error(check.message || '微博 Cookie 仍未处于登录状态，请完成登录后再关闭窗口')
    return ''
  }
  await saveUserCookie(platform, userId, res.cookie)
  await window.electronAPI!.markCookieValid({ platform, userId, cookie: res.cookie })
  return res.cookie
}

async function startUserDownload(
  user: UserEntry,
  dates?: { startDate?: string; endDate?: string; deepBacktrack?: boolean; includeReplies?: boolean; repliesMediaOnly?: boolean; includeQuotes?: boolean; includeBookmarks?: boolean; includeLikes?: boolean; includeQuoted?: boolean; includeReels?: boolean; includeStories?: boolean },
) {
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
      deepBacktrack: userPlatform === 'weibo' ? Boolean(dates?.deepBacktrack) : false,
      includeReplies: userPlatform === 'twitter' ? Boolean(dates?.includeReplies) : false,
      repliesMediaOnly: userPlatform === 'twitter' ? Boolean(dates?.repliesMediaOnly) : false,
      includeQuotes: userPlatform === 'twitter' ? Boolean(dates?.includeQuotes) : false,
      includeBookmarks: userPlatform === 'twitter' ? Boolean(dates?.includeBookmarks) : false,
      includeLikes: userPlatform === 'twitter' ? Boolean(dates?.includeLikes) : false,
      includeQuoted: userPlatform === 'weibo' ? Boolean(dates?.includeQuoted) : false,
      includeReels: userPlatform === 'instagram' ? Boolean(dates?.includeReels) : false,
      includeStories: userPlatform === 'instagram' ? Boolean(dates?.includeStories) : false,
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
  await startUserDownload(user, weiboDownloadOptions(user))
}

function weiboDownloadOptions(user?: UserEntry) {
  const platform = normalizePlatform(user?.platform ?? currentUser.value?.platform, 'weibo')
  if (platform !== 'weibo') return {}
  const forCurrent = !user || user.path === selectedUser.value
  return { deepBacktrack: forCurrent ? deepBacktrack.value : false }
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
  await enterUser(path)
}

async function handleUpdateUser(user: UserEntry) {
  await startUserDownload(user, weiboDownloadOptions(user))
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

async function handleAddUser(data: {
  platform: string
  userId: string
  cookie: string
  startDate?: string
  endDate?: string
  deepBacktrack?: boolean
  includeReplies?: boolean
  repliesMediaOnly?: boolean
  includeQuotes?: boolean
  includeBookmarks?: boolean
  includeLikes?: boolean
  includeQuoted?: boolean
  includeReels?: boolean
  includeStories?: boolean
}) {
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
    browseMode.value = 'user'
    selectedUser.value = existing.path
    await loadPosts()
    await startUserDownload(existing, {
      startDate: data.startDate,
      endDate: data.endDate,
      deepBacktrack: data.deepBacktrack,
      includeReplies: data.includeReplies,
      repliesMediaOnly: data.repliesMediaOnly,
      includeQuotes: data.includeQuotes,
      includeBookmarks: data.includeBookmarks,
      includeLikes: data.includeLikes,
      includeQuoted: data.includeQuoted,
      includeReels: data.includeReels,
      includeStories: data.includeStories,
    })
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
      deepBacktrack: data.platform === 'weibo' ? Boolean(data.deepBacktrack) : false,
      includeReplies: data.platform === 'twitter' ? Boolean(data.includeReplies) : false,
      repliesMediaOnly: data.platform === 'twitter' ? Boolean(data.repliesMediaOnly) : false,
      includeQuotes: data.platform === 'twitter' ? Boolean(data.includeQuotes) : false,
      includeBookmarks: data.platform === 'twitter' ? Boolean(data.includeBookmarks) : false,
      includeLikes: data.platform === 'twitter' ? Boolean(data.includeLikes) : false,
      includeQuoted: data.platform === 'weibo' ? Boolean(data.includeQuoted) : false,
      includeReels: data.platform === 'instagram' ? Boolean(data.includeReels) : false,
      includeStories: data.platform === 'instagram' ? Boolean(data.includeStories) : false,
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
    if (browseMode.value === 'user' && keep && users.value.some((u) => u.path === keep)) {
      selectedUser.value = keep
      await loadPosts({ silent: opts?.silent })
    }
    if (browseMode.value === 'hub') {
      await loadArchiveStats()
    }
  } catch (e) { /* ignore */ }
}

async function exportMarkdown() {
  if (!selectedUser.value || !window.electronAPI) {
    toast.warning('没有可导出的内容')
    return
  }
  exporting.value = true
  try {
    const res = await window.electronAPI.exportMarkdown({ userDir: selectedUser.value })
    if (res.success) {
      toast.success(`已导出 ${res.count || 0} 篇 Markdown`)
      if (res.destDir) await window.electronAPI.openFolder(res.destDir)
    } else {
      toast.error(res.error || '导出失败')
    }
  } catch (e) {
    toast.error('导出失败')
  } finally {
    exporting.value = false
  }
}

async function exportRss() {
  if (!selectedUser.value || !window.electronAPI) {
    toast.warning('没有可导出的内容')
    return
  }
  exporting.value = true
  try {
    const res = await window.electronAPI.exportRss({ userDir: selectedUser.value })
    if (res.success) {
      toast.success(`已生成 RSS（${res.count || 0} 条）`)
      if (res.destPath) await window.electronAPI.openFolder(selectedUser.value)
    } else {
      toast.error(res.error || '导出失败')
    }
  } catch (e) {
    toast.error('导出失败')
  } finally {
    exporting.value = false
  }
}

async function exportJson() {
  if (!selectedUser.value || !window.electronAPI) {
    toast.warning('没有可导出的内容')
    return
  }
  exporting.value = true
  try {
    const res = await window.electronAPI.exportJson({ userDir: selectedUser.value })
    if (res.success) {
      toast.success(`已导出 ${res.count || 0} 篇 JSON`)
      if (res.destPath) await window.electronAPI.openFolder(selectedUser.value)
    } else {
      toast.error(res.error || '导出失败')
    }
  } catch (e) {
    toast.error('导出失败')
  } finally {
    exporting.value = false
  }
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
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: calc(100vh - 58px);
  max-height: calc(100vh - 58px);
  position: sticky;
  top: 58px;
  background: var(--sa-bg);
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
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 16px;
  backdrop-filter: blur(12px);
  background: var(--sa-bar-bg);
  border-bottom: 1px solid var(--sa-edge);
}

.bar-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.bar-left,
.bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bar-filters {
  padding-top: 2px;
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
  transition: background var(--sa-transition), border-color var(--sa-transition), color var(--sa-transition);
}

.sort-toggle button:hover:not(.active) {
  background: var(--sa-hover);
  color: var(--sa-ink);
}

.sort-toggle button.active {
  background: var(--sa-accent);
  border-color: var(--sa-accent);
  color: #fff;
}

.hub-label {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--sa-ink);
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
  border-radius: var(--sa-radius-control);
  padding: 0 12px;
  font: inherit;
  border: 1px solid var(--sa-edge);
  background: var(--sa-field);
  color: var(--sa-ink);
  transition: border-color var(--sa-transition), box-shadow var(--sa-transition);
}

.user-field select:focus {
  border-color: var(--sa-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sa-accent) 18%, transparent);
  outline: none;
}

.post-count {
  font-size: 13px;
  color: var(--sa-muted);
}

.bar-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--sa-muted);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.bar-check input {
  margin: 0;
}

.bar-menu {
  position: relative;
}

.bar-menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 148px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--sa-edge);
  background: var(--sa-surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bar-menu-panel button {
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  color: var(--sa-ink);
  cursor: pointer;
}

.bar-menu-panel button:hover:not(:disabled) {
  background: var(--sa-field);
}

.bar-menu-panel button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.view-toggle {
  display: flex;
  gap: 6px;
}

.view-toggle button {
  height: 32px;
  border-radius: 999px;
  border: 1px solid var(--sa-edge);
  background: transparent;
  color: var(--sa-muted);
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background var(--sa-transition), border-color var(--sa-transition), color var(--sa-transition);
}

.view-toggle button:hover:not(.active) {
  background: var(--sa-hover);
  color: var(--sa-ink);
}

.view-toggle button.active {
  background: var(--sa-accent);
  border-color: var(--sa-accent);
  color: #fff;
}

.profile-stats {
  margin-top: 6px;
  font-size: 12px;
  color: var(--sa-muted);
  line-height: 1.5;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-filter {
  display: flex;
  align-items: center;
  gap: 4px;
}

.date-input {
  width: 118px;
  height: 32px;
  border-radius: var(--sa-radius-control);
  border: 1px solid var(--sa-edge);
  background: var(--sa-field);
  color: var(--sa-ink);
  padding: 0 8px;
  font: inherit;
  font-size: 12px;
  transition: border-color var(--sa-transition), box-shadow var(--sa-transition);
}

.date-input:focus {
  border-color: var(--sa-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sa-accent) 18%, transparent);
  outline: none;
}

.date-sep {
  color: var(--sa-muted);
  font-size: 12px;
}

.hashtag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex: 1 1 100%;
}

.hashtag-filter .sa-pill-btn.active {
  border-color: var(--sa-accent);
  background: color-mix(in srgb, var(--sa-accent) 16%, transparent);
}

:deep(.sa-search-mark) {
  background: rgba(255, 214, 0, 0.45);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.search-input {
  width: 140px;
  height: 32px;
  border-radius: var(--sa-radius-control);
  border: 1px solid var(--sa-edge);
  background: var(--sa-field);
  color: var(--sa-ink);
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  transition: border-color var(--sa-transition), box-shadow var(--sa-transition);
}

.search-input:focus {
  border-color: var(--sa-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sa-accent) 18%, transparent);
  outline: none;
}

.search-results {
  max-width: 600px;
  margin: 0 auto;
  padding: 8px 16px 0;
  background: var(--sa-surface);
  border-bottom: 1px solid var(--sa-hairline);
}

.search-results-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--sa-muted);
  margin-bottom: 6px;
}

.search-hit {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 8px 0;
  border-top: 1px solid var(--sa-hairline);
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.hit-user {
  display: block;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 2px;
}

.hit-snippet {
  display: block;
  font-size: 13px;
  color: var(--sa-muted);
  line-height: 1.4;
}

.feed {
  max-width: 600px;
  margin: 0 auto;
  background: var(--sa-surface);
  box-shadow: var(--sa-feed-shadow);
  border-inline: var(--sa-feed-border);
}

.profile-card {
  position: relative;
  border-bottom: 1px solid var(--sa-hairline);
}

.profile-main {
  display: flex;
  gap: 12px;
  padding: 16px 16px 14px;
  align-items: center;
}

.profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--sa-avatar);
  color: #fff;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-text {
  min-width: 0;
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
  height: 88px;
}

.skeleton-post {
  height: 120px;
  margin: 12px 16px;
  border-radius: 0;
}

.empty-state {
  text-align: center;
  padding: 48px 20px;
}

.empty-state p {
  margin-bottom: 12px;
  color: var(--sa-muted);
}

.empty-state.inner {
  padding: 28px 20px 36px;
}
</style>
