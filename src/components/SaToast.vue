<template>
  <div class="sa-toast-wrap" aria-live="polite">
    <TransitionGroup name="sa-toast">
      <div
        v-for="item in items"
        :key="item.id"
        class="sa-toast"
        :class="['sa-toast--' + (item.type || 'info'), { 'sa-toast--closing': item.closing }]"
      >
        <span class="sa-toast-msg">{{ item.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import type { ToastItem } from '../composables/useToast'

defineProps<{
  items: ToastItem[]
}>()
</script>

<style scoped>
.sa-toast-wrap {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  width: min(520px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.sa-toast {
  pointer-events: auto;
  width: 100%;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid var(--sa-edge);
  background: color-mix(in srgb, var(--sa-surface) 92%, transparent);
  backdrop-filter: blur(12px);
  color: var(--sa-ink);
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.sa-toast--success {
  color: var(--sa-ok);
  border-color: var(--sa-ok);
}

.sa-toast--error {
  color: var(--sa-danger);
  border-color: var(--sa-danger);
}

.sa-toast--warning,
.sa-toast--info {
  color: var(--sa-accent);
  border-color: var(--sa-accent);
}

.sa-toast-msg {
  display: block;
  word-break: break-word;
}

.sa-toast--closing {
  opacity: 0;
  transform: translateY(-6px);
}

.sa-toast-enter-active,
.sa-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.sa-toast-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.sa-toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.sa-toast-move {
  transition: transform 0.22s ease;
}
</style>
