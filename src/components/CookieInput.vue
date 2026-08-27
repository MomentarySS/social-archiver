<template>
  <div class="cookie-input">
    <div class="sa-label">登录</div>

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
      </label>
      <div class="sa-row cookie-actions">
        <button class="sa-btn sa-btn-primary" type="button" :disabled="loggingIn" @click="handleTwitterLogin">
          {{ loggingIn ? '登录中…' : '应用内登录 X' }}
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
      </label>
      <div class="sa-row cookie-actions">
        <button class="sa-btn sa-btn-primary" type="button" :disabled="loggingIn" @click="handleInstagramLogin">
          {{ loggingIn ? '登录中…' : '应用内登录 Instagram' }}
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
          @input="onChange(($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <div class="sa-row cookie-actions">
        <button class="sa-btn sa-btn-primary" type="button" :disabled="loggingIn" @click="handleWeiboLogin">
          {{ loggingIn ? '登录中…' : '应用内登录微博' }}
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from '../composables/useToast'

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

watch(
  () => props.platform,
  (platform) => {
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
  const parts: string[] = []
  if (authToken.value.trim()) parts.push(`auth_token=${authToken.value.trim()}`)
  if (ct0.value.trim()) parts.push(`ct0=${ct0.value.trim()}`)
  if (extraCookies.value.trim()) parts.push(extraCookies.value.trim())
  emit('update:modelValue', parts.join('; '))
}

function emitInstagramCookie() {
  const parts: string[] = []
  if (sessionid.value.trim()) parts.push(`sessionid=${sessionid.value.trim()}`)
  emit('update:modelValue', parts.join('; '))
}

function onChange(value: string) {
  emit('update:modelValue', value)
}

async function handleWeiboLogin() {
  loggingIn.value = true
  try {
    if (window.electronAPI) {
      const res = await window.electronAPI.weiboLogin()
      if (res.success && res.cookie) {
        emit('update:modelValue', res.cookie)
        toast.success('微博登录成功，Cookie 已自动填入')
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
</style>
