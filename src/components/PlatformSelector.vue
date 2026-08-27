<template>
  <div class="platform-selector" role="radiogroup" aria-label="平台">
    <button
      type="button"
      role="radio"
      :aria-checked="modelValue === 'twitter'"
      :class="{ active: modelValue === 'twitter' }"
      @click="onChange('twitter')"
    >X</button>
    <button
      type="button"
      role="radio"
      :aria-checked="modelValue === 'weibo'"
      :class="{ active: modelValue === 'weibo' }"
      @click="onChange('weibo')"
    >微博</button>
    <button
      type="button"
      role="radio"
      :aria-checked="modelValue === 'instagram'"
      :class="{ active: modelValue === 'instagram' }"
      @click="onChange('instagram')"
    >Instagram</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function onChange(value: string) {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.platform-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.platform-selector button {
  flex: 1;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--sa-edge);
  background: transparent;
  color: var(--sa-muted);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.platform-selector button.active {
  background: var(--sa-accent);
  border-color: var(--sa-accent);
  color: #fff;
}
</style>
