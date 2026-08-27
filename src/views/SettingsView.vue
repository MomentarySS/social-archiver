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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from '../composables/useToast'

interface Settings {
  output_dir?: string
  concurrent?: number
  naming_template?: string
}

const settings = ref<Settings>({
  output_dir: '',
  concurrent: 3,
  naming_template: '{post_id}_{index}',
})
const saving = ref(false)
const toast = useToast()

onMounted(async () => {
  await loadSettings()
})

async function loadSettings() {
  try {
    if (window.electronAPI) {
      const s = await window.electronAPI.getSettings()
      settings.value = {
        output_dir: s.output_dir || '',
        concurrent: s.concurrent ?? 3,
        naming_template: s.naming_template || '{post_id}_{index}',
      }
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
      const current = await window.electronAPI.getSettings()
      await window.electronAPI.saveSettings({ ...current, ...settings.value })
      toast.success('设置已保存')
    }
  } catch (e) {
    toast.error('保存设置失败')
  } finally {
    saving.value = false
  }
}
</script>
