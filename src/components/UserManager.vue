<template>
  <div class="user-manager">
    <!-- Header -->
    <div class="um-header">
      <span class="um-title">用户管理</span>
      <div class="um-header-actions">
        <button class="ghost-btn" type="button" @click="toggleAddForm">
          {{ showAddForm ? '取消' : '+ 添加用户' }}
        </button>
      </div>
    </div>

    <!-- Add User Form -->
    <div v-if="showAddForm" class="um-add-form">
      <label class="um-field">
        <span>平台</span>
        <select v-model="addForm.platform" class="um-select um-select-block">
          <option value="weibo">微博</option>
          <option value="twitter">X / Twitter</option>
          <option value="instagram">Instagram</option>
        </select>
      </label>
      <UserIdInput v-model="addForm.userId" :platform="addForm.platform" />
      <CookieInput v-model="addForm.cookie" :platform="addForm.platform" />
      <div class="um-form-row">
        <input
          v-model="addForm.startDate"
          class="um-input"
          type="date"
          :max="addForm.endDate || undefined"
          aria-label="起始日期"
        />
        <input
          v-model="addForm.endDate"
          class="um-input"
          type="date"
          :min="addForm.startDate || undefined"
          aria-label="结束日期"
        />
      </div>
      <p class="um-date-hint">日期可选。留空则拉该用户全部原创。</p>
      <label v-if="addForm.platform === 'weibo'" class="um-deep-check">
        <input type="checkbox" v-model="addForm.deepBacktrack" />
        <span>深度回溯</span>
      </label>
      <label v-if="addForm.platform === 'weibo'" class="um-deep-check">
        <input type="checkbox" v-model="addForm.includeQuoted" />
        <span>收录带评论转发</span>
      </label>
      <template v-if="addForm.platform === 'twitter'">
        <label class="um-deep-check">
          <input type="checkbox" v-model="addForm.includeReplies" />
          <span>同时缓存回复时间线</span>
        </label>
        <label v-if="addForm.includeReplies" class="um-deep-check um-deep-check-sub">
          <input type="checkbox" v-model="addForm.repliesMediaOnly" />
          <span>回复仅保留带媒体</span>
        </label>
        <label class="um-deep-check">
          <input type="checkbox" v-model="addForm.includeQuotes" />
          <span>同时缓存引用帖</span>
        </label>
        <label class="um-deep-check">
          <input type="checkbox" v-model="addForm.includeBookmarks" />
          <span>同时缓存书签（--bookmarks）</span>
        </label>
        <label class="um-deep-check">
          <input type="checkbox" v-model="addForm.includeLikes" />
          <span>同时缓存点赞（--likes）</span>
        </label>
      </template>
      <template v-if="addForm.platform === 'instagram'">
        <label class="um-deep-check">
          <input type="checkbox" v-model="addForm.includeReels" />
          <span>同时缓存 Reels</span>
        </label>
        <label class="um-deep-check">
          <input type="checkbox" v-model="addForm.includeStories" />
          <span>同时缓存 Stories（约 24h 时效）</span>
        </label>
      </template>
      <div class="um-form-row um-form-actions">
        <button class="primary-btn" type="button" :disabled="!addFormValid" @click="submitAddUser">
          开始缓存
        </button>
      </div>
    </div>

    <!-- Batch bar (above list so actions stay visible) -->
    <div v-if="users.length" class="um-footer">
      <label class="um-select-all">
        <input type="checkbox" :checked="allChecked" @change="toggleAll" />
        <span>全选</span>
      </label>
      <div class="um-footer-actions">
        <span class="um-selected-count">{{ checkedUsers.size }} 个已选</span>
        <button
          class="ghost-btn"
          type="button"
          :disabled="checkedUsers.size === 0 || batchRunning"
          @click="emit('batch-delete', [...checkedUsers])"
        >批量删除</button>
        <button
          class="primary-btn"
          type="button"
          :disabled="checkedUsers.size === 0 || batchRunning"
          @click="startBatchUpdate"
        >批量更新</button>
      </div>
    </div>

    <!-- Batch Progress Bar -->
    <div v-if="batchRunning" class="um-batch-progress">
      <div class="batch-status">
        <span v-if="currentBatchUser">
          正在缓存：{{ currentBatchUser }}
        </span>
        <span v-else>批量任务进行中…</span>
        <span class="batch-count">
          {{ completedCount }} / {{ totalBatchCount }} 完成
        </span>
      </div>
      <div class="batch-bar">
        <div class="batch-bar-fill" :style="{ width: batchPercent + '%' }"></div>
      </div>
      <div class="um-form-row um-form-actions">
        <button class="ghost-btn" type="button" @click="emit('stop-batch')">停止</button>
      </div>
    </div>

    <!-- User List -->
    <div class="um-list">
      <div v-if="!users.length" class="um-empty">
        还没有已存档的用户。添加用户后会自动缓存。
      </div>

      <div
        v-for="user in users"
        :key="user.path"
        class="um-item"
        :class="{
          'is-selected': selectedUser === user.path,
          'is-checking': checkedUsers.has(user.path),
        }"
        @click="handleItemClick(user.path, $event)"
      >
        <!-- Checkbox -->
        <input
          type="checkbox"
          class="um-check"
          :checked="checkedUsers.has(user.path)"
          @click.stop
          @change="toggleCheck(user.path)"
        />

        <!-- Platform badge -->
        <span class="um-platform" :class="`plat-${user.platform || 'unknown'}`">
          {{ platformLabel(user.platform) }}
        </span>

        <!-- User info -->
        <div class="um-user-info" @click.stop="emit('select-user', user.path)">
          <span class="um-name">{{ user.displayName || user.name }}</span>
          <span class="um-id">@{{ user.name }}</span>
        </div>

        <!-- Per-user actions -->
        <div class="um-item-actions" @click.stop>
          <button
            class="ghost-btn um-action-btn"
            type="button"
            :disabled="batchRunning || isRunningUser(user)"
            :title="`更新 ${user.displayName || user.name}`"
            @click="emit('update-user', user)"
          >
            {{ isRunningUser(user) ? '…' : '更新' }}
          </button>
          <button
            class="ghost-btn um-action-btn danger"
            type="button"
            :disabled="batchRunning"
            :title="`删除 ${user.displayName || user.name} 的存档`"
            @click="confirmDelete(user)"
          >
            删除
          </button>
        </div>

        <div class="um-item-meta">
          <select
            class="um-schedule"
            :value="scheduleFor(user)"
            :disabled="batchRunning"
            @click.stop
            @change="onScheduleChange(user, $event)"
          >
            <option value="manual">手动</option>
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
          </select>
          <span class="um-time">{{ formatLastUpdate(user.lastUpdate) }}</span>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Dialog -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="um-dialog-overlay" @click.self="deleteTarget = null">
        <div class="um-dialog">
          <p>确定删除 <strong>{{ deleteTarget.displayName || deleteTarget.name }}</strong> 的存档？</p>
          <p class="um-dialog-sub">此操作不可恢复。</p>
          <div class="um-dialog-actions">
            <button class="ghost-btn" type="button" @click="deleteTarget = null">取消</button>
            <button class="danger-btn" type="button" @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CookieInput from './CookieInput.vue'
import UserIdInput from './UserIdInput.vue'
import { cookieForPlatform, hasUsableCookie } from '../utils/session.js'
import { hasInvalidHandleChars, normalizeUserId } from '../utils/userId.js'
import type { UserEntry } from '../electron-api.d.ts'

interface BatchStatus {
  queued: number
  running: boolean
  currentUserId?: string
  currentPlatform?: string
}

const props = defineProps<{
  users: UserEntry[]
  selectedUser: string
  outputDir: string
  batchStatus: BatchStatus
  batchRunning: boolean
  batchCompleted: number   // how many done in current batch
  batchTotal: number       // total in current batch
  userSchedules?: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'select-user', path: string): void
  (e: 'update-user', user: UserEntry): void
  (e: 'delete-user', user: UserEntry): void
  (e: 'batch-update', users: UserEntry[]): void
  (e: 'batch-delete', paths: string[]): void
  (e: 'add-user', data: { platform: string; userId: string; cookie: string; startDate?: string; endDate?: string; deepBacktrack?: boolean; includeReplies?: boolean; repliesMediaOnly?: boolean; includeQuotes?: boolean; includeBookmarks?: boolean; includeLikes?: boolean; includeQuoted?: boolean; includeReels?: boolean; includeStories?: boolean }): void
  (e: 'stop-batch'): void
  (e: 'update-schedule', data: { platform: string; userId: string; schedule: string }): void
}>()

// ─── State ────────────────────────────────────────────────────────
const checkedUsers = ref(new Set<string>())
const showAddForm = ref(false)
const addForm = ref({ platform: 'twitter', userId: '', cookie: '', startDate: '', endDate: '', deepBacktrack: false, includeReplies: false, repliesMediaOnly: false, includeQuotes: false, includeBookmarks: false, includeLikes: false, includeQuoted: false, includeReels: false, includeStories: false })
const deleteTarget = ref<UserEntry | null>(null)

// ─── Computed ───────────────────────────────────────────────────
const allChecked = computed(() =>
  props.users.length > 0 && props.users.every(u => checkedUsers.value.has(u.path))
)

const runningUser = computed(() => props.batchStatus.currentUserId || '')

const isRunningUser = (user: UserEntry) =>
  Boolean(
    runningUser.value
    && user.name === runningUser.value
    && (!props.batchStatus.currentPlatform || (user.platform || '') === props.batchStatus.currentPlatform),
  )

const currentBatchUser = computed(() => {
  const id = props.batchStatus.currentUserId
  const plat = props.batchStatus.currentPlatform
  if (!id) return ''
  const u = props.users.find((item) => item.name === id && (!plat || (item.platform || '') === plat))
    || props.users.find((item) => item.name === id)
  return u ? (u.displayName || u.name) : id
})

const totalBatchCount = computed(() => props.batchTotal)
const completedCount = computed(() => props.batchCompleted)

const batchPercent = computed(() => {
  if (!totalBatchCount.value) return 0
  return Math.round((completedCount.value / totalBatchCount.value) * 100)
})

const addFormValid = computed(() => {
  const account = normalizeUserId(addForm.value.userId, addForm.value.platform)
  if (!account) return false
  if (hasInvalidHandleChars(account, addForm.value.platform)) return false
  return hasUsableCookie(addForm.value.platform, addForm.value.cookie)
})

// ─── Methods ────────────────────────────────────────────────────
function platformLabel(platform?: string) {
  if (platform === 'weibo') return '微博'
  if (platform === 'twitter' || platform === 'x') return 'X'
  if (platform === 'instagram') return 'IG'
  return '?'
}

function formatLastUpdate(ts?: string) {
  if (!ts) return '从未更新'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 3600) return `${Math.round(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function scheduleFor(user: UserEntry) {
  const platform = user.platform || 'weibo'
  const key = `${platform}:${user.name}`
  return props.userSchedules?.[key] || 'manual'
}

function onScheduleChange(user: UserEntry, event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update-schedule', {
    platform: user.platform || 'weibo',
    userId: user.name,
    schedule: target.value,
  })
}

function handleItemClick(path: string, event: MouseEvent) {
  if ((event.target as HTMLElement).closest('.um-item-actions, .um-item-meta, .um-check, button, select')) return
  emit('select-user', path)
}

function toggleCheck(path: string) {
  const next = new Set(checkedUsers.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  checkedUsers.value = next
}

function toggleAll() {
  if (allChecked.value) {
    checkedUsers.value = new Set()
  } else {
    checkedUsers.value = new Set(props.users.map(u => u.path))
  }
}

function submitAddUser() {
  if (!addFormValid.value) return
  const account = normalizeUserId(addForm.value.userId, addForm.value.platform)
  emit('add-user', {
    platform: addForm.value.platform,
    userId: account,
    cookie: addForm.value.cookie.trim(),
    startDate: addForm.value.startDate || undefined,
    endDate: addForm.value.endDate || undefined,
    deepBacktrack: addForm.value.platform === 'weibo' ? addForm.value.deepBacktrack : false,
    includeReplies: addForm.value.platform === 'twitter' ? addForm.value.includeReplies : false,
    repliesMediaOnly: addForm.value.platform === 'twitter' ? addForm.value.repliesMediaOnly : false,
    includeQuotes: addForm.value.platform === 'twitter' ? addForm.value.includeQuotes : false,
    includeBookmarks: addForm.value.platform === 'twitter' ? addForm.value.includeBookmarks : false,
    includeLikes: addForm.value.platform === 'twitter' ? addForm.value.includeLikes : false,
    includeQuoted: addForm.value.platform === 'weibo' ? addForm.value.includeQuoted : false,
    includeReels: addForm.value.platform === 'instagram' ? addForm.value.includeReels : false,
    includeStories: addForm.value.platform === 'instagram' ? addForm.value.includeStories : false,
  })
  addForm.value = { platform: 'twitter', userId: '', cookie: '', startDate: '', endDate: '', deepBacktrack: false, includeReplies: false, repliesMediaOnly: false, includeQuotes: false, includeBookmarks: false, includeLikes: false, includeQuoted: false, includeReels: false, includeStories: false }
  showAddForm.value = false
}

function confirmDelete(user: UserEntry) {
  deleteTarget.value = user
}

async function doDelete() {
  if (!deleteTarget.value) return
  const user = deleteTarget.value
  deleteTarget.value = null
  emit('delete-user', user)
}

async function loadCookieForPlatform() {
  if (!window.electronAPI) return
  try {
    const settings = await window.electronAPI.getSettings()
    addForm.value.cookie = cookieForPlatform(settings, addForm.value.platform) || ''
  } catch {
    addForm.value.cookie = ''
  }
}

async function toggleAddForm() {
  if (showAddForm.value) {
    showAddForm.value = false
    return
  }
  await loadCookieForPlatform()
  showAddForm.value = true
}

watch(
  () => addForm.value.platform,
  async () => {
    if (!showAddForm.value) return
    await loadCookieForPlatform()
  },
)

function startBatchUpdate() {
  const selected = props.users.filter(u => checkedUsers.value.has(u.path))
  emit('batch-update', selected)
}

// Reset checked users when users list changes
watch(() => props.users, () => {
  const existing = new Set(props.users.map(u => u.path))
  const next = new Set([...checkedUsers.value].filter(p => existing.has(p)))
  checkedUsers.value = next
})
</script>

<style scoped>
.user-manager {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--sa-bg);
  border-bottom: 1px solid var(--sa-edge);
}

/* Header */
.um-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}

.um-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--sa-ink);
}

.um-header-actions {
  display: flex;
  gap: 6px;
}

/* Add form */
.um-add-form {
  padding: 10px 16px 14px;
  border-bottom: 1px solid var(--sa-edge);
  background: var(--sa-panel);
  max-height: min(48vh, 420px);
  overflow-y: auto;
}

.um-form-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.um-form-row:last-child {
  margin-bottom: 0;
}

.um-select,
.um-input {
  height: 30px;
  border-radius: 999px;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  outline: none;
}

.um-select {
  border: 1px solid var(--sa-edge);
  background: var(--sa-surface);
  color: var(--sa-ink);
  min-width: 90px;
}

.um-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--sa-muted);
}

.um-select-block {
  width: 100%;
  min-width: 0;
}

.um-add-form :deep(.cookie-input),
.um-add-form :deep(.user-id-input) {
  margin-bottom: 10px;
}

.um-add-form :deep(.sa-btn) {
  font-size: 12px;
  padding: 0 10px;
}

.um-input {
  flex: 1;
  border: 1px solid var(--sa-edge);
  background: var(--sa-surface);
  color: var(--sa-ink);
}

.um-input-wide {
  width: 100%;
}

.cookie-hint-row {
  margin-bottom: 6px;
}

.cookie-hint {
  font-size: 12px;
}

.cookie-hint.ok { color: #52c41a; }
.cookie-hint.miss { color: #ff4d4f; }

.um-date-hint {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--sa-muted);
}

.um-deep-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--sa-muted);
}

.um-deep-check-sub {
  margin-left: 18px;
}

.um-form-actions {
  justify-content: flex-end;
}

/* User list */
.um-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.um-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--sa-muted);
}

.um-item {
  display: grid;
  grid-template-columns: 16px auto minmax(0, 1fr) auto;
  grid-template-areas:
    "check plat info actions"
    ". meta meta meta";
  column-gap: 8px;
  row-gap: 6px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--sa-hairline);
  cursor: pointer;
  transition: background var(--sa-transition);
}

.um-item:last-child {
  border-bottom: none;
}

.um-item.is-selected {
  background: color-mix(in srgb, var(--sa-accent) 10%, transparent);
}

.um-item:hover {
  background: var(--sa-hover);
}

.um-check {
  grid-area: check;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
}

.um-platform {
  grid-area: plat;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.plat-weibo { background: #ff8200; color: #fff; }
.plat-twitter { background: #1d9bf0; color: #fff; }
.plat-instagram { background: #0095f6; color: #fff; }
.plat-unknown { background: var(--sa-muted); color: #fff; }

.um-user-info {
  grid-area: info;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.um-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--sa-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.um-id {
  font-size: 11px;
  color: var(--sa-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.um-item-meta {
  grid-area: meta;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.um-time {
  font-size: 11px;
  color: var(--sa-muted);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.um-schedule {
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--sa-edge);
  background: var(--sa-surface);
  color: var(--sa-ink);
  font-size: 11px;
  padding: 0 8px;
  flex-shrink: 0;
}

.um-item-actions {
  grid-area: actions;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.um-action-btn {
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid var(--sa-edge);
  background: transparent;
  color: var(--sa-ink);
  cursor: pointer;
  font-family: inherit;
}

.um-action-btn.danger {
  color: #ed4956;
  border-color: #ed4956;
}

.um-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Batch bar */
.um-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--sa-edge);
  gap: 8px;
  flex-wrap: wrap;
}

.um-select-all {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sa-muted);
  cursor: pointer;
}

.um-footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.um-selected-count {
  font-size: 12px;
  color: var(--sa-muted);
}

/* Batch progress */
.um-batch-progress {
  flex-shrink: 0;
  padding: 8px 16px 10px;
  border-bottom: 1px solid var(--sa-edge);
  background: color-mix(in srgb, var(--sa-accent) 6%, var(--sa-surface));
}

.batch-status {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--sa-muted);
  margin-bottom: 6px;
}

.batch-count {
  color: var(--sa-accent);
  font-weight: 700;
}

.batch-bar {
  height: 3px;
  background: var(--sa-edge);
  border-radius: 999px;
  overflow: hidden;
}

.batch-bar-fill {
  height: 100%;
  background: var(--sa-accent);
  transition: width 0.3s ease;
}

/* Buttons (reuse BrowseView skin buttons) */
.ghost-btn,
.primary-btn,
.danger-btn {
  height: 30px;
  border-radius: 999px;
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}

.ghost-btn {
  background: transparent;
  border: 1px solid var(--sa-edge);
  color: var(--sa-ink);
}

.primary-btn {
  background: var(--sa-accent, #ff8200);
  border: 0;
  color: #fff;
}

.danger-btn {
  background: #ed4956;
  border: 0;
  color: #fff;
}

.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Dialog */
.um-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.um-dialog {
  background: var(--sa-surface, #fff);
  color: var(--sa-ink, #333);
  border-radius: 12px;
  padding: 24px;
  max-width: 360px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

.um-dialog p {
  margin: 0 0 8px;
  font-size: 15px;
}

.um-dialog-sub {
  font-size: 13px !important;
  color: var(--sa-muted, #939393) !important;
}

.um-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
