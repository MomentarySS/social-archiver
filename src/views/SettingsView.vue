<template>
  <div class="sa-sheet">
    <div class="sa-page">
      <h2>设置</h2>
      <p class="lede">默认目录和下载参数会记住。缓存时仍可临时换目录。</p>

      <label class="sa-field">
        <span>默认下载目录</span>
        <div class="sa-row">
          <input class="sa-input" :value="settings.output_dir" readonly placeholder="选择下载目录" />
          <button class="sa-btn sa-btn-ghost" type="button" @click="selectDir">选择</button>
        </div>
      </label>

      <label class="sa-field">
        <span>并发数</span>
        <input
          class="sa-input"
          type="number"
          min="1"
          max="10"
          v-model.number="settings.concurrent"
        />
      </label>

      <label class="sa-field">
        <span>文件命名</span>
        <input
          class="sa-input"
          v-model="settings.naming_template"
          placeholder="{post_id}_{index}"
        />
        <p class="sa-help">可用 {post_id}、{user_id}、{date}、{index}。默认可避免同日重名。</p>
      </label>

      <button class="sa-btn sa-btn-primary" type="button" :disabled="saving" @click="saveSettings">
        {{ saving ? '保存中…' : '保存设置' }}
      </button>

      <hr class="sa-rule" />

      <h3 class="cookie-heading">登录 Cookie</h3>
      <p class="lede cookie-lede">只留本机。过期后点重新登录，不必回到缓存页。</p>

      <div v-for="row in platformRows" :key="row.key" class="cookie-row">
        <div class="cookie-meta">
          <span class="cookie-name">{{ row.label }}</span>
          <span class="cookie-mask" :class="row.value ? 'ok' : 'miss'">
            {{ row.value ? maskCookie(row.value) : '未保存' }}
          </span>
        </div>
        <div class="cookie-actions">
          <button
            class="sa-btn sa-btn-ghost"
            type="button"
            :disabled="loggingKey === row.key"
            @click="reloginPlatform(row.platform)"
          >{{ loggingKey === row.key ? '登录中…' : '重新登录' }}</button>
          <button
            class="sa-btn sa-btn-danger"
            type="button"
            :disabled="!row.value"
            @click="clearPlatform(row.platform)"
          >清除</button>
        </div>
      </div>

      <div v-if="userRows.length" class="cookie-users">
        <p class="sa-help">按用户保存的 Cookie</p>
        <div v-for="row in userRows" :key="row.key" class="cookie-row">
          <div class="cookie-meta">
            <span class="cookie-name">{{ row.label }}</span>
            <span class="cookie-mask ok">{{ maskCookie(row.value) }}</span>
          </div>
          <div class="cookie-actions">
            <button class="sa-btn sa-btn-danger" type="button" @click="clearUser(row.platform, row.userId)">
              清除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from '../composables/useToast'
import {
  cookieInventory,
  clearPlatformCookie,
  clearUserCookie,
  maskCookie,
  savePlatformCookie,
} from '../utils/session.js'
import type { Settings } from '../electron-api.d.ts'

const settings = ref<Settings>({
  output_dir: '',
  concurrent: 3,
  naming_template: '{post_id}_{index}',
})
const saving = ref(false)
const loggingKey = ref('')
const toast = useToast()

const platformRows = computed(() => cookieInventory(settings.value).platformRows)
const userRows = computed(() => cookieInventory(settings.value).userRows)

onMounted(async () => {
  await loadSettings()
})

async function loadSettings() {
  try {
    if (window.electronAPI) {
      const s = await window.electronAPI.getSettings()
      settings.value = s
    }
  } catch (e) {
    console.error('加载设置失败:', e)
  }
}

async function selectDir() {
  try {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectOutputDir()
      if (selected) {
        settings.value.output_dir = selected
      }
    }
  } catch (e) {
    console.error('选择目录失败:', e)
    toast.error('打开目录选择器失败')
  }
}

async function saveSettings() {
  saving.value = true
  try {
    if (window.electronAPI) {
      await window.electronAPI.saveSettings({
        output_dir: settings.value.output_dir,
        concurrent: settings.value.concurrent,
        naming_template: settings.value.naming_template,
      })
      toast.success('设置已保存')
    }
  } catch (e) {
    toast.error('保存设置失败')
  } finally {
    saving.value = false
  }
}

async function reloginPlatform(platform: string) {
  if (!window.electronAPI) return
  loggingKey.value = platform
  try {
    let res
    if (platform === 'twitter') res = await window.electronAPI.twitterLogin()
    else if (platform === 'instagram') res = await window.electronAPI.instagramLogin()
    else res = await window.electronAPI.weiboLogin()
    if (!res.success || !res.cookie) {
      toast.error(res.error || '登录失败')
      return
    }
    await savePlatformCookie(platform, res.cookie)
    await loadSettings()
    toast.success('Cookie 已更新')
  } catch (e) {
    toast.error('登录失败')
  } finally {
    loggingKey.value = ''
  }
}

async function clearPlatform(platform: string) {
  await clearPlatformCookie(platform)
  await loadSettings()
  toast.success('已清除')
}

async function clearUser(platform: string, userId: string) {
  await clearUserCookie(platform, userId)
  await loadSettings()
  toast.success('已清除')
}
</script>

<style scoped>
.cookie-heading {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
}

.cookie-lede {
  margin-bottom: 12px;
}

.cookie-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sa-hairline);
}

.cookie-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cookie-name {
  font-size: 13px;
  font-weight: 700;
}

.cookie-mask {
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  color: var(--sa-muted);
}

.cookie-mask.ok {
  color: var(--sa-ok);
}

.cookie-mask.miss {
  color: var(--sa-muted);
}

.cookie-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.cookie-users {
  margin-top: 8px;
}
</style>
