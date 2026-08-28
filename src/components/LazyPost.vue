<template>
  <div ref="root" class="lazy-post">
    <PostCard v-if="shown" :post="post" />
    <div v-else class="lazy-post-slot" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import PostCard from './PostCard.vue'
import type { Post } from '../electron-api.d.ts'

defineProps<{
  post: Post
}>()

const root = ref<HTMLElement | null>(null)
const shown = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  const el = root.value
  if (!el) {
    shown.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        shown.value = true
        observer?.disconnect()
        observer = null
      }
    },
    { rootMargin: '900px 0px', threshold: 0.01 },
  )
  observer.observe(el)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<style scoped>
.lazy-post-slot {
  min-height: 120px;
}
</style>
