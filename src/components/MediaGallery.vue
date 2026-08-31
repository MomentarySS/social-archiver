<template>
  <div class="media-gallery">
    <div v-for="group in groups" :key="group.date" class="gallery-group">
      <h3 class="gallery-date">{{ group.date }}</h3>
      <div class="gallery-grid">
        <button
          v-for="item in group.items"
          :key="item.key"
          type="button"
          class="gallery-cell"
          :class="{ 'is-video': item.type === 'video' }"
          @click="emit('open-post', item.postId)"
        >
          <img v-if="item.thumbUrl" :src="item.thumbUrl" loading="lazy" alt="" />
          <span v-if="item.type === 'video'" class="video-badge">视频</span>
          <span v-else-if="item.type === 'livephoto'" class="video-badge">LIVE</span>
        </button>
      </div>
    </div>
    <p v-if="!groups.length" class="gallery-empty">这个用户还没有媒体</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { localAssetUrl } from '../utils/assetUrl.js'
import type { Post } from '../electron-api.d.ts'

const props = defineProps<{
  posts: Post[]
}>()

const emit = defineEmits<{
  (e: 'open-post', postId: string): void
}>()

const groups = computed(() => {
  const map = new Map<string, Array<{
    key: string
    postId: string
    type: string
    thumbUrl: string
  }>>()
  for (const post of props.posts || []) {
    const postId = String(post.id || '')
    const date = post.date || 'unknown'
    for (const [idx, pic] of (post.pics || []).entries()) {
      const path = pic.abs_path || ''
      if (!path) continue
      const items = map.get(date) || []
      items.push({
        key: `${postId}:${idx}`,
        postId,
        type: pic.type || 'image',
        thumbUrl: localAssetUrl(path),
      })
      map.set(date, items)
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }))
})
</script>

<style scoped>
.media-gallery {
  padding: 0 16px 24px;
  container-type: inline-size;
}

.gallery-group + .gallery-group {
  margin-top: 20px;
}

.gallery-date {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--sa-muted);
  font-weight: 700;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

@container (max-width: 420px) {
  .gallery-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.gallery-cell {
  position: relative;
  aspect-ratio: 1;
  border: 0;
  padding: 0;
  overflow: hidden;
  background: var(--sa-media);
  cursor: pointer;
}

.gallery-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 0 6px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
}

.gallery-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--sa-muted);
  font-size: 13px;
}
</style>
