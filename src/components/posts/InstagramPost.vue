<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Post } from '../../electron-api.d.ts'
import { usePostCard } from './usePostCard'
import PostLightbox from './PostLightbox.vue'
import './postCard.css'

const props = defineProps<{
  post: Post
  highlightQuery?: string
}>()

const {
  postDomId,
  avatarUrl,
  initial,
  displayName,
  handle,
  isCarousel,
  carouselCount,
  isStory,
  isReel,
  igTime,
  weiboText,
  mediaItems,
  mediaSlots,
  cellLabel,
  openViewer,
  brokenVideo,
  videoSrcUrls,
  posterUrls,
  markVideoBroken,
  openLocalFile,
  stillUrls,
  openLink,
  viewerVisible,
  viewerStill,
  viewerMotion,
  viewerIndex,
  bindLightboxVideo,
  isPlayableLive,
  markLiveBroken,
  closeViewer,
} = usePostCard(props)

const carouselIndex = ref(0)

const hasMultipleMedia = computed(() => mediaItems.value.length > 1)
const activeSlot = computed(() => mediaSlots.value[carouselIndex.value] || null)

watch(
  () => props.post.id,
  () => {
    carouselIndex.value = 0
  },
)

function goToSlide(index: number) {
  const last = mediaItems.value.length - 1
  carouselIndex.value = Math.max(0, Math.min(last, index))
}

function prevSlide() {
  goToSlide(carouselIndex.value - 1)
}

function nextSlide() {
  goToSlide(carouselIndex.value + 1)
}

function openActiveViewer() {
  if (activeSlot.value) openViewer(activeSlot.value.idx)
}
</script>

<template>
  <article :id="postDomId" class="ig-post">
    <div
      class="ig-card"
      :class="{
        'has-media': mediaItems.length > 0,
        'is-reel': isReel,
        'is-story': isStory,
      }"
    >
      <div
        v-if="mediaItems.length"
        class="ig-media-panel"
        :class="{ 'is-carousel': hasMultipleMedia }"
      >
        <template v-if="activeSlot">
          <div class="ig-slide-view">
            <video
              v-if="activeSlot.pic.type === 'video' && !brokenVideo.has(activeSlot.idx)"
              :src="videoSrcUrls[activeSlot.idx] || ''"
              :poster="posterUrls[activeSlot.idx] || ''"
              controls
              playsinline
              preload="metadata"
              @error="markVideoBroken(activeSlot.idx)"
            />
            <div v-else-if="activeSlot.pic.type === 'video'" class="video-fallback">
              <p>该视频编码在窗口内无法播放，请使用系统播放器打开</p>
              <button type="button" @click="openLocalFile(activeSlot.pic.abs_path)">用系统播放器打开</button>
            </div>
            <button
              v-else
              type="button"
              class="ig-media-button"
              :aria-label="cellLabel(activeSlot.pic)"
              @click="openActiveViewer"
            >
              <img :src="stillUrls[activeSlot.idx] || ''" loading="lazy" alt="" />
            </button>
          </div>
        </template>

        <button
          v-if="hasMultipleMedia && carouselIndex > 0"
          type="button"
          class="ig-nav ig-nav-prev"
          aria-label="上一张"
          @click="prevSlide"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 9 12l5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button
          v-if="hasMultipleMedia && carouselIndex < mediaItems.length - 1"
          type="button"
          class="ig-nav ig-nav-next"
          aria-label="下一张"
          @click="nextSlide"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 15 12l-5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>

        <div v-if="hasMultipleMedia" class="ig-dots" role="tablist" :aria-label="`轮播 ${carouselCount} 张`">
          <button
            v-for="(_, dotIndex) in mediaItems"
            :key="dotIndex"
            type="button"
            class="ig-dot"
            :class="{ active: dotIndex === carouselIndex }"
            :aria-label="`第 ${Number(dotIndex) + 1} 张`"
            :aria-selected="dotIndex === carouselIndex"
            @click="goToSlide(Number(dotIndex))"
          />
        </div>
      </div>

      <aside class="ig-side">
        <header class="ig-side-head">
          <button class="ig-avatar" type="button" tabindex="-1">
            <img v-if="avatarUrl" :src="avatarUrl" alt="" />
            <span v-else>{{ initial }}</span>
          </button>
          <div class="ig-head-main">
            <div class="ig-head-line">
              <span class="ig-username">{{ displayName }}</span>
              <span v-if="isCarousel" class="ig-carousel-badge">轮播 {{ carouselCount }}</span>
              <span v-if="isStory" class="ig-story-badge">Story</span>
              <span v-if="isReel" class="ig-reel-badge">Reel</span>
            </div>
            <span class="ig-handle">@{{ handle }}</span>
          </div>
        </header>

        <div class="ig-side-body">
          <div v-if="post.text" class="ig-caption">
            <span class="ig-caption-user">{{ displayName }}</span>
            <span class="ig-caption-text" v-html="weiboText"></span>
          </div>
          <p v-else class="ig-caption-empty">无配文</p>
        </div>

        <footer class="ig-meta">
          <span class="ig-time">{{ igTime }}</span>
          <a
            v-if="post.url"
            class="ig-open"
            :href="post.url"
            @click.prevent="openLink(post.url)"
          >查看原文</a>
        </footer>
      </aside>
    </div>
  </article>

  <PostLightbox
    :viewer-visible="viewerVisible"
    :viewer-still="viewerStill"
    :viewer-motion="viewerMotion"
    :viewer-index="viewerIndex"
    :on-lightbox-video="bindLightboxVideo"
    :is-playable-live="isPlayableLive"
    :mark-live-broken="markLiveBroken"
    :close-viewer="closeViewer"
  />
</template>
