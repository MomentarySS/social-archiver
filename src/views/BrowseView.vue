<template>
  <div class="browse-view" :class="`skin-${skin}`">
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
            <p v-if="skin === 'weibo'">微博 / {{ currentUser.name }}</p>
            <p v-else>@{{ currentUser.name }}</p>
          </div>
        </div>
      </section>
      <div class="feed-gap"></div>

      <div v-if="displayedPosts.length" class="timeline">
        <PostCard
          v-for="post in displayedPosts"
          :key="`${sortOrder}:${post.id || post.url}`"
          :post="post"
        />
      </div>

      <div v-else class="empty-state inner">
        <p>{{ users.length ? '这个用户还没有可浏览的帖子' : '这个目录里还没有已缓存的用户' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PostCard from '../components/PostCard.vue'
import { writeArchiveHtml } from '../utils/archiveHtml.js'
import { sortPosts } from '../utils/postTime.js'
import { setAppPlatform } from '../skin.js'
import { cookieForPlatform, hasUsableCookie, savePlatformCookie } from '../utils/session.js'
import { useToast } from '../composables/useToast'

interface UserEntry {
  name: string
  path: string
  platform?: string
  displayName?: string
  avatar?: string
}

interface Pic {
  filename?: string
  date_folder?: string
  abs_path?: string
  original_url?: string
  type?: string
}

interface Post {
  id?: string
  platform?: string
  user_id?: string
  user_name?: string
  screen_name?: string
  text?: string
  created_at?: string
  date?: string
  url?: string
  source?: string
  pics?: Pic[]
  likes?: number
  comments?: number
  reposts?: number
}

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

const currentUser = computed(() => users.value.find(u => u.path === selectedUser.value) || null)
const displayedPosts = computed(() => sortPosts(posts.value, sortOrder.value))

function setSortOrder(order: 'newest' | 'oldest') {
  sortOrder.value = order
}

const skin = computed(() => {
  const platform = (currentUser.value?.platform || posts.value[0]?.platform || '').toLowerCase()
  if (platform === 'twitter' || platform === 'x') return 'twitter'
  if (platform === 'instagram') return 'instagram'
  if (platform === 'weibo') return 'weibo'
  const url = posts.value[0]?.url || ''
  if (/x\.com|twitter\.com/i.test(url)) return 'twitter'
  if (/instagram\.com/i.test(url)) return 'instagram'
  return 'weibo'
})

watch(skin, (value) => {
  setAppPlatform(value)
}, { immediate: true })

watch(currentUser, async (user) => {
  headerAvatar.value = ''
  if (user?.avatar && window.electronAPI) {
    try {
      headerAvatar.value = await window.electronAPI.assetUrl(user.avatar)
    } catch (e) { /* ignore */ }
  }
})

onMounted(async () => {
  setupUpdateListeners()
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
      users.value = await window.electronAPI.scanArchives(outputDir.value)
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

async function updateArchive() {
  const user = currentUser.value
  if (!user || !outputDir.value || !window.electronAPI) return
  if (updating.value || await window.electronAPI.isDownloading()) {
    toast.warning('已有缓存任务进行中')
    return
  }

  const platform = skin.value === 'twitter' ? 'twitter' : skin.value === 'instagram' ? 'instagram' : 'weibo'
  const settings = await window.electronAPI.getSettings()
  let cookie = cookieForPlatform(settings, platform)

  if (!hasUsableCookie(platform, cookie)) {
    toast.info(
      platform === 'twitter' ? '需要登录 X，打开登录窗'
        : platform === 'instagram' ? '需要登录 Instagram，打开登录窗'
        : '需要登录微博，打开登录窗'
    )
    let res
    if (platform === 'twitter') {
      res = await window.electronAPI.twitterLogin()
    } else if (platform === 'instagram') {
      res = await window.electronAPI.instagramLogin()
    } else {
      res = await window.electronAPI.weiboLogin()
    }
    if (!res.success || !res.cookie) {
      toast.error(res.error || '登录失败。也可到缓存页粘贴 Cookie 后再更新。')
      return
    }
    cookie = res.cookie
    await savePlatformCookie(platform, cookie)
  }

  updating.value = true
  try {
    const res = await window.electronAPI.startDownload({
      platform,
      userId: user.name,
      cookie,
      outputDir: outputDir.value,
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

async function refreshCurrentArchive(userDir?: string, opts?: { silent?: boolean }) {
  if (!window.electronAPI || !outputDir.value) return
  const keep = userDir || selectedUser.value
  try {
    users.value = await window.electronAPI.scanArchives(outputDir.value)
    if (keep && users.value.some((user) => user.path === keep)) {
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
      platform: skin.value,
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
.browse-view {
  min-height: calc(100vh - 58px);
}

.skin-weibo {
  background: #f2f2f5;
  color: #333;
}

.skin-twitter {
  background: #000;
  color: #e7e9ea;
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
}

.skin-weibo .browse-bar {
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #e6e6e6;
}

.skin-twitter .browse-bar {
  background: rgba(0, 0, 0, 0.85);
  border-bottom: 1px solid #2f3336;
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
}

.skin-weibo .sort-toggle button {
  border: 1px solid #e6e6e6;
  background: transparent;
  color: #939393;
}

.skin-weibo .sort-toggle button.active {
  background: #ff8200;
  border-color: #ff8200;
  color: #fff;
}

.skin-twitter .sort-toggle button {
  border: 1px solid #2f3336;
  background: transparent;
  color: #71767b;
}

.skin-twitter .sort-toggle button.active {
  background: #1d9bf0;
  border-color: #1d9bf0;
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
}

.skin-weibo .user-field select {
  border: 1px solid #e6e6e6;
  background: #fff;
  color: #333;
}

.skin-twitter .user-field select {
  border: 1px solid #2f3336;
  background: #16181c;
  color: #e7e9ea;
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
}

.skin-weibo .ghost-btn {
  border: 1px solid #e6e6e6;
  color: #333;
}

.skin-twitter .ghost-btn {
  border: 1px solid #536471;
  color: #e7e9ea;
}

.primary-btn {
  border: 0;
  color: #fff;
}

.skin-weibo .primary-btn {
  background: #ff8200;
}

.skin-twitter .primary-btn {
  background: #1d9bf0;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.post-count {
  font-size: 13px;
  opacity: 0.7;
}

.feed {
  max-width: 600px;
  margin: 0 auto;
  min-height: 70vh;
}

.skin-weibo .feed {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.skin-twitter .feed {
  border-inline: 1px solid #2f3336;
}

.skin-instagram {
  background: #fafafa;
  color: #262626;
}

.skin-instagram .browse-bar {
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #dbdbdb;
}

.skin-instagram .sort-toggle button {
  border: 1px solid #dbdbdb;
  background: transparent;
  color: #8e8e8e;
}

.skin-instagram .sort-toggle button.active {
  background: #0095f6;
  border-color: #0095f6;
  color: #fff;
}

.skin-instagram .user-field select {
  border: 1px solid #dbdbdb;
  background: #fff;
  color: #262626;
}

.skin-instagram .ghost-btn {
  border: 1px solid #dbdbdb;
  color: #262626;
}

.skin-instagram .primary-btn {
  background: #0095f6;
}

.skin-instagram .feed {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.skin-instagram .cover {
  background: linear-gradient(45deg, #f58529 0%, #dd2a7b 50%, #515bd4 100%);
}

.skin-instagram .profile-avatar {
  background: #dd2a7b;
  color: #fff;
  border: 3px solid #fff;
}

.skin-instagram .profile-text p {
  color: #8e8e8e;
}

.skin-instagram .feed-gap {
  background: #fafafa;
}

.skin-instagram .skeleton-profile,
.skin-instagram .skeleton-post {
  background: #f7f7f7;
}

.profile-card {
  position: relative;
}

.cover {
  height: 120px;
}

.skin-weibo .cover {
  background: linear-gradient(180deg, #ff8200 0%, #ffb366 100%);
}

.skin-twitter .cover {
  background: #333639;
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
}

.skin-weibo .profile-avatar {
  background: #ffb366;
  color: #fff;
  border: 3px solid #fff;
}

.skin-twitter .profile-avatar {
  background: #536471;
  color: #fff;
  border: 4px solid #000;
  margin-top: -36px;
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
}

.skin-weibo .profile-text p {
  color: #939393;
}

.skin-twitter .profile-text p {
  color: #71767b;
}

.feed-gap {
  height: 8px;
}

.skin-weibo .feed-gap {
  background: #f2f2f5;
}

.skin-twitter .feed-gap {
  height: 0;
  border-bottom: 1px solid #2f3336;
}

.skeleton-profile,
.skeleton-post {
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
}

.skin-weibo .skeleton-profile,
.skin-weibo .skeleton-post {
  background: #f7f7f7;
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
  opacity: 0.7;
}

.empty-state.inner {
  padding: 48px 20px;
}
</style>
