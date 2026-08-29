<script setup lang="ts">
import { computed } from 'vue'
import FeedStylePost from './posts/FeedStylePost.vue'
import XPost from './posts/XPost.vue'
import { detectPostPlatform } from '../utils/postPlatform.js'
import type { Post } from '../electron-api.d.ts'

const props = defineProps<{ post: Post; highlightQuery?: string }>()
const platform = computed(() => detectPostPlatform(props.post))
</script>

<template>
  <XPost v-if="platform === 'twitter'" :post="post" :highlight-query="props.highlightQuery" />
  <FeedStylePost v-else-if="platform === 'instagram'" :post="post" platform="instagram" :highlight-query="props.highlightQuery" />
  <FeedStylePost v-else :post="post" platform="weibo" :highlight-query="props.highlightQuery" />
</template>
