<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import './postCard.css'

const props = defineProps<{
  viewerVisible: boolean
  viewerStill: string
  viewerMotion: string
  viewerIndex: number
  onLightboxVideo: (el: HTMLVideoElement | null) => void
  isPlayableLive: (index: number) => boolean
  markLiveBroken: (index: number) => void
  closeViewer: () => void
}>()

function setLightboxVideo(el: Element | ComponentPublicInstance | null) {
  props.onLightboxVideo(el as HTMLVideoElement | null)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="viewerVisible && viewerStill"
      class="sa-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="查看图片"
      @click.self="closeViewer"
    >
      <button class="sa-lightbox-close" type="button" @click="closeViewer">关闭</button>
      <div class="sa-lightbox-stage">
        <video
          v-if="viewerMotion && isPlayableLive(viewerIndex)"
          :ref="setLightboxVideo"
          class="sa-lightbox-player"
          :poster="viewerStill"
          :src="viewerMotion"
          muted
          loop
          playsinline
          autoplay
          @error="markLiveBroken(viewerIndex)"
        />
        <img v-else :src="viewerStill" alt="" />
      </div>
    </div>
  </Teleport>
</template>
