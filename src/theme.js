import { ref, watch } from 'vue'
import { normalizePlatform } from './constants'

export const THEME_STORAGE_KEY = 'sa-browse-theme'

export const appPlatform = ref('twitter')

export function setAppPlatform(value) {
  appPlatform.value = normalizePlatform(value, 'twitter')
}

function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light'
}

function readStoredTheme() {
  if (typeof localStorage === 'undefined') return 'light'
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))
}

export const browseTheme = ref(readStoredTheme())

export function setBrowseTheme(value) {
  browseTheme.value = normalizeTheme(value)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, browseTheme.value)
  }
}

export function toggleBrowseTheme() {
  setBrowseTheme(browseTheme.value === 'dark' ? 'light' : 'dark')
}

function applyDocumentTheme(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = normalizeTheme(theme)
  }
}

watch(
  browseTheme,
  (value) => {
    applyDocumentTheme(value)
  },
  { immediate: true },
)
