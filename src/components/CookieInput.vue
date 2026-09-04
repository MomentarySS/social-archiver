<template>
  <div class="cookie-input">
    <div class="sa-label">登录</div>

    <div v-if="compact" class="cookie-compact">
      <span class="cookie-hint ok">已登录</span>
      <div class="sa-row cookie-actions">
        <button class="sa-btn sa-btn-ghost" type="button" @click="revealForm">重新登录</button>
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="loggingIn" @click="importCurrentFromEdge">
          从 Edge 导入
        </button>
      </div>
    </div>

    <template v-else>
    <template v-if="platform === 'twitter'">
      <label class="sa-field">
        <span>auth_token</span>
        <input
          class="sa-input"
          type="password"
          v-model="authToken"
          placeholder="从 x.com Cookie 复制值"
          autocomplete="off"
          @input="emitTwitterCookie"
        />
        <span class="cookie-hint" :class="authToken ? 'ok' : 'miss'">
          {{ authToken ? '✓ auth_token 已填' : '✗ auth_token 未填' }}
        </span>
      </label>
      <label class="sa-field">
        <span>ct0</span>
        <input
          class="sa-input"
          type="password"
          v-model="ct0"
          placeholder="从 x.com Cookie 复制值"
          autocomplete="off"
          @input="emitTwitterCookie"
        />
        <span class="cookie-hint" :class="ct0 ? 'ok' : 'miss'">
          {{ ct0 ? '✓ ct0 已填' : '✗ ct0 未填' }}
        </span>
      </label>
      <div class="sa-row cookie-actions">
        <button class="sa-btn sa-btn-primary" type="button" :disabled="loggingIn" @click="handleTwitterLogin">
          {{ loggingIn ? '登录中…' : '应用内登录 X' }}
        </button>
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="loggingIn" @click="importCurrentFromEdge">
          从 Edge 导入
        </button>
        <button
          class="sa-btn sa-btn-ghost"
          type="button"
          @click="openSite('https://x.com', '已打开 x.com。F12 → 应用 → Cookie → x.com，分别复制 auth_token 和 ct0')"
        >打开 x.com</button>
      </div>
      <p class="sa-help">
        两个值请分开填。登录 x.com 后：F12 → 应用 → Cookie → <code>x.com</code>，复制
        <code>auth_token</code> 和 <code>ct0</code> 的值。也可点应用内登录自动填入。
      </p>
    </template>

    <template v-else-if="platform === 'instagram'">
      <label class="sa-field">
        <span>sessionid</span>
        <input
          class="sa-input"
          type="password"
          v-model="sessionid"
          placeholder="从 instagram.com Cookie 复制值"
          autocomplete="off"
          @input="emitInstagramCookie"
        />
        <span class="cookie-hint" :class="sessionid ? 'ok' : 'miss'">
          {{ sessionid ? '✓ sessionid 已填' : '✗ sessionid 未填' }}
        </span>
      </label>
      <div class="sa-row cookie-actions">
        <button class="sa-btn sa-btn-primary" type="button" :disabled="loggingIn" @click="handleInstagramLogin">
          {{ loggingIn ? '登录中…' : '应用内登录 Instagram' }}
        </button>
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="loggingIn" @click="refreshInstagramPartition">
          刷新应用内登录
        </button>
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="loggingIn" @click="importCurrentFromEdge">
          从 Edge 导入
        </button>
        <button
          class="sa-btn sa-btn-ghost"
          type="button"
          @click="openSite('https://www.instagram.com/accounts/login/', '已打开 Instagram 登录页。登录后把 sessionid 粘贴到上方')"
        >打开 Instagram</button>
      </div>
      <p class="sa-help">
        从 <code>instagram.com</code> 取 Cookie，登录后 F12 → 应用 → Cookie → <code>instagram.com</code>，复制 <code>sessionid</code> 的值。应用内登录若失败，改用浏览器粘贴。
      </p>
    </template>

    <template v-else>
      <label class="sa-field">
        <span>Cookie</span>
        <textarea
          class="sa-textarea"
          :value="modelValue"
          placeholder="粘贴 m.weibo.cn 的完整 Cookie（需包含 SUB）"
          @input="onWeiboInput"
        />
        <span class="cookie-hint" :class="weiboHasSub ? 'ok' : 'miss'">
          {{ weiboHasSub ? '✓ SUB 已检测到' : '✗ SUB 未检测到' }}
        </span>
      </label>
      <div class="sa-row cookie-actions">
        <button class="sa-btn sa-btn-primary" type="button" :disabled="loggingIn" @click="handleWeiboLogin">
          {{ loggingIn ? '登录中…' : '应用内登录微博' }}
        </button>
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="loggingIn" @click="importCurrentFromEdge">
          从 Edge 导入
        </button>
        <button
          class="sa-btn sa-btn-ghost"
          type="button"
          @click="openSite('https://m.weibo.cn', '已打开 m.weibo.cn，登录后把 Cookie 粘贴到上方')"
        >打开 m.weibo.cn</button>
      </div>
      <p class="sa-help">
        从 <code>m.weibo.cn</code> 取 Cookie，不要用 weibo.com。登录后 F12 → Network → 复制请求头 Cookie，至少包含
        <code>SUB</code>。应用内登录若闪退，改用浏览器粘贴。
      </p>
    </template>
    <button
      v-if="hasSavedCookie"
      class="sa-btn sa-btn-ghost cookie-collapse"
      type="button"
      @click="collapseForm"
    >收起</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from '../composables/useToast'
import { hasUsableCookie, savePlatformCookie } from '../utils/session.js'
import type { BrowserCookieImportItem } from '../electron-api.d.ts'

const props = defineProps<{
  modelValue: string
  platform: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const loggingIn = ref(false)
const authToken = ref('')
const ct0 = ref('')
const extraCookies = ref('')
const sessionid = ref('')
const toast = useToast()
const revealed = ref(false)
const dirty = ref(false)

const weiboHasSub = computed(() => /\bSUB=/.test(props.modelValue || ''))
const hasSavedCookie = computed(() => hasUsableCookie(props.platform, props.modelValue))
const compact = computed(() => hasSavedCookie.value && !revealed.value && !dirty.value)

function revealForm() {
  revealed.value = true
}

function collapseForm() {
  revealed.value = false
  dirty.value = false
}

function markDirty() {
  dirty.value = true
}

watch(
  () => props.platform,
  (platform) => {
    revealed.value = false
    dirty.value = false
    if (platform === 'twitter' && (props.modelValue || '').startsWith('browser:')) {
      emit('update:modelValue', '')
    }
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (raw) => {
    if (props.platform !== 'twitter') return
    const parsed = parseCookieMap(raw || '')
    authToken.value = parsed.auth_token || ''
    ct0.value = parsed.ct0 || ''
    extraCookies.value = Object.entries(parsed)
      .filter(([key]) => key !== 'auth_token' && key !== 'ct0')
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (raw) => {
    if (props.platform !== 'instagram') return
    const parsed = parseCookieMap(raw || '')
    sessionid.value = parsed.sessionid || ''
  },
  { immediate: true },
)

function parseCookieMap(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!raw || raw.startsWith('browser:')) return result
  for (const part of raw.split(';')) {
    const trimmed = part.trim()
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (key && value) result[key] = value
  }
  return result
}

function emitTwitterCookie() {
  markDirty()
  const parts: string[] = []
  if (authToken.value.trim()) parts.push(`auth_token=${authToken.value.trim()}`)
  if (ct0.value.trim()) parts.push(`ct0=${ct0.value.trim()}`)
  if (extraCookies.value.trim()) parts.push(extraCookies.value.trim())
  emit('update:modelValue', parts.join('; '))
}

function emitInstagramCookie() {
  markDirty()
  const parsed = parseCookieMap(props.modelValue || '')
  if (sessionid.value.trim()) parsed.sessionid = sessionid.value.trim()
  else delete parsed.sessionid
  emit(
    'update:modelValue',
    Object.entries(parsed)
      .map(([key, value]) => `${key}=${value}`)
      .join('; '),
  )
}

function onChange(value: string) {
  markDirty()
  emit('update:modelValue', value)
}

function onWeiboInput(event: Event) {
  onChange((event.target as HTMLTextAreaElement).value)
}

async function handleWeiboLogin() {
  loggingIn.value = true
  try {
    if (window.electronAPI) {
      const res = await window.electronAPI.weiboLogin()
      if (res.success && res.cookie) {
        emit('update:modelValue', res.cookie)
        await savePlatformCookie('weibo', res.cookie)
        collapseForm()
        toast.success('微博登录成功，Cookie 已保存')
      } else {
        toast.error(res.error || '登录失败')
      }
    }
  } catch (e) {
    toast.error('登录失败，请改用浏览器复制 Cookie')
  } finally {
    loggingIn.value = false
  }
}

async function handleTwitterLogin() {
  loggingIn.value = true
  try {
    if (window.electronAPI) {
      const res = await window.electronAPI.twitterLogin()
      if (res.success && res.cookie) {
        emit('update:modelValue', res.cookie)
        await savePlatformCookie('twitter', res.cookie)
        collapseForm()
        toast.success('X 登录成功，auth_token 和 ct0 已分别填入')
      } else {
        toast.error(res.error || '登录失败')
      }
    }
  } catch (e) {
    toast.error('登录失败。请手动把 auth_token 和 ct0 填到对应栏')
  } finally {
    loggingIn.value = false
  }
}

async function handleInstagramLogin() {
  loggingIn.value = true
  try {
    if (window.electronAPI) {
      const res = await window.electronAPI.instagramLogin()
      if (res.success && res.cookie) {
        emit('update:modelValue', res.cookie)
        await savePlatformCookie('instagram', res.cookie)
        collapseForm()
        toast.success('Instagram 登录成功，sessionid 已自动填入')
      } else {
        toast.error(res.error || '登录失败')
      }
    }
  } catch (e) {
    toast.error('登录失败。请手动把 sessionid 填到上方')
  } finally {
    loggingIn.value = false
  }
}

function applyImportedCookie(item: BrowserCookieImportItem) {
  if (!item.cookie) return
  emit('update:modelValue', item.cookie)
}

async function importCurrentFromEdge() {
  if (!window.electronAPI?.importBrowserCookies) return
  loggingIn.value = true
  try {
    const res = await window.electronAPI.importBrowserCookies({
      browser: 'edge',
      platform: props.platform,
    })
    if (!res.success) {
      toast.error(res.error || '从 Edge 导入失败')
      return
    }
    const item = res.imports?.find((row) => row.platform === props.platform)
    if (!item?.cookie) {
      toast.warning(item?.message || '未在 Edge 中找到该平台登录 Cookie')
      return
    }
    applyImportedCookie(item)
    await savePlatformCookie(props.platform, item.cookie)
    collapseForm()
    if (item.valid) toast.success(item.message || '已从 Edge 导入并校验通过')
    else toast.warning(item.message || '已导入，但校验未通过')
  } catch (e) {
    toast.error('从 Edge 导入失败')
  } finally {
    loggingIn.value = false
  }
}

async function refreshInstagramPartition() {
  if (!window.electronAPI?.refreshInstagramSession) return
  loggingIn.value = true
  try {
    const res = await window.electronAPI.refreshInstagramSession()
    if (!res.refreshed || !res.cookie) {
      toast.warning(res.message || '未能从应用内登录分区读取 sessionid')
      return
    }
    emit('update:modelValue', res.cookie)
    const check = await window.electronAPI.checkCookie({ platform: 'instagram', cookie: res.cookie })
    if (check.valid) {
      collapseForm()
      toast.success(check.message || '已刷新 Instagram sessionid')
    } else toast.warning(check.message || '已刷新，但校验未通过')
  } catch (e) {
    toast.error('刷新应用内登录失败')
  } finally {
    loggingIn.value = false
  }
}

async function openSite(url: string, message: string) {
  try {
    if (window.electronAPI) {
      await window.electronAPI.openExternal(url)
      toast.info(message)
    }
  } catch (e) {
    toast.error('无法打开系统浏览器')
  }
}
</script>

<style scoped>
.cookie-input {
  margin-bottom: 8px;
}

.cookie-actions {
  margin-bottom: 4px;
}

.cookie-compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 8px;
}

.cookie-collapse {
  margin-top: 4px;
}

.cookie-hint {
  font-size: 12px;
  margin-left: 8px;
  vertical-align: middle;
}

.cookie-hint.ok {
  color: #52c41a;
}

.cookie-hint.miss {
  color: #ff4d4f;
}
</style>
