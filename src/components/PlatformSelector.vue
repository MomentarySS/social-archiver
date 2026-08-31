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
  gap: 6px;
  margin-bottom: 0;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--sa-edge);
  background: var(--sa-field);
}

.platform-selector button {
  flex: 1;
  height: 34px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sa-muted);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--sa-transition),
    border-color var(--sa-transition),
    color var(--sa-transition),
    transform 0.1s ease;
}

.platform-selector button:hover:not(.active) {
  color: var(--sa-ink);
  background: var(--sa-hover);
}

.platform-selector button.active {
  background: var(--sa-accent);
  border-color: var(--sa-accent);
  color: #fff;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--sa-accent) 35%, transparent);
}
</style>
