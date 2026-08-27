<template>
  <label class="sa-field user-id-input">
    <span>{{ platform === 'twitter' ? '用户名' : '用户 ID' }}</span>
    <input
      class="sa-input"
      :value="modelValue"
      :placeholder="platform === 'instagram' ? '如 username' : platform === 'twitter' ? '如 elonmusk' : '如 1234567890'"
      autocomplete="off"
      @input="onChange(($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  platform: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function onChange(value: string) {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.user-id-input {
  margin-bottom: 16px;
}
</style>
