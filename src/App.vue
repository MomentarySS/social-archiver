<template>
  <div class="app-shell">
    <header class="app-top">
      <div class="brand">
        <h1>Social Archiver</h1>
        <p>社交存档</p>
      </div>
      <nav class="app-nav" aria-label="主导航">
        <button
          type="button"
          :class="{ active: activeTab === 'download' }"
          @click="activeTab = 'download'"
        >缓存</button>
        <button
          type="button"
          :class="{ active: activeTab === 'browse' }"
          @click="activeTab = 'browse'"
        >浏览</button>
        <button
          type="button"
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >设置</button>
      </nav>
    </header>

    <main class="app-body">
      <HomeView v-show="activeTab === 'download'" />
      <BrowseView v-show="activeTab === 'browse'" />
      <SettingsView v-show="activeTab === 'settings'" />
    </main>

    <SaToast :items="toastItems" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import HomeView from './views/HomeView.vue'
import BrowseView from './views/BrowseView.vue'
import SettingsView from './views/SettingsView.vue'
import SaToast from './components/SaToast.vue'
import { toastItems } from './composables/useToast'

const activeTab = ref<'download' | 'browse' | 'settings'>('download')

function handleShortcut(tab: string) {
  if (tab === 'download' || tab === 'browse' || tab === 'settings') {
    activeTab.value = tab
  }
}

let cleanupShortcut: (() => void) | undefined

onMounted(() => {
  if (window.electronAPI?.onShortcut) {
    cleanupShortcut = window.electronAPI.onShortcut(handleShortcut)
  }
})

onUnmounted(() => {
  cleanupShortcut?.()
})
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--sa-bg);
  color: var(--sa-ink);
}

.app-top {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--sa-surface) 92%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--sa-edge);
}

.brand h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.brand p {
  margin: 0;
  font-size: 12px;
  color: var(--sa-muted);
}

.app-nav {
  display: flex;
  gap: 4px;
}

.app-nav button {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--sa-muted);
  font-size: 13px;
  cursor: pointer;
}

.app-nav button:hover {
  color: var(--sa-ink);
}

.app-nav button.active {
  color: var(--sa-ink);
  background: var(--sa-field);
  box-shadow: inset 0 -2px 0 var(--sa-accent);
}

.app-body {
  min-height: calc(100vh - 58px);
}
</style>
