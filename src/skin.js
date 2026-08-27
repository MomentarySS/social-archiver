import { ref, watch } from 'vue'

export const appPlatform = ref('twitter')

function normalizeSkin(value) {
  return value === 'weibo' || value === 'instagram' ? value : 'twitter'
}

export function setAppPlatform(value) {
  appPlatform.value = normalizeSkin(value)
}

watch(
  appPlatform,
  (value) => {
    document.documentElement.dataset.skin = normalizeSkin(value)
  },
  { immediate: true },
)
