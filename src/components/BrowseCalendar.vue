<template>
  <section v-if="monthDays.length" class="browse-calendar sa-section">
    <div class="browse-calendar-head">
      <button class="sa-pill-btn sa-pill-btn--ghost" type="button" @click="shiftMonth(-1)">‹</button>
      <span class="browse-calendar-title">{{ monthLabel }}</span>
      <button class="sa-pill-btn sa-pill-btn--ghost" type="button" @click="shiftMonth(1)">›</button>
    </div>
    <div class="browse-calendar-weekdays">
      <span v-for="label in weekdays" :key="label">{{ label }}</span>
    </div>
    <div class="browse-calendar-grid">
      <button
        v-for="cell in monthDays"
        :key="cell.key"
        type="button"
        class="browse-calendar-day"
        :class="{
          muted: !cell.inMonth,
          hasPosts: cell.count > 0,
          selected: cell.dateKey && cell.dateKey === modelValue,
        }"
        :disabled="!cell.inMonth || !cell.dateKey"
        @click="selectDate(cell.dateKey)"
      >
        <span class="day-num">{{ cell.day }}</span>
        <span v-if="cell.count" class="day-count">{{ cell.count }}</span>
      </button>
    </div>
    <button
      v-if="modelValue"
      class="sa-pill-btn sa-pill-btn--ghost browse-calendar-clear"
      type="button"
      @click="selectDate('')"
    >清除日期</button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { postDateKey } from '../utils/postTime.js'
import type { Post } from '../electron-api.d.ts'

const props = defineProps<{
  posts: Post[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const cursor = ref(new Date())

const dateCounts = computed(() => {
  const map = new Map<string, number>()
  for (const post of props.posts || []) {
    const key = postDateKey(post)
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
})

const monthLabel = computed(() => {
  const y = cursor.value.getFullYear()
  const m = cursor.value.getMonth() + 1
  return `${y} 年 ${m} 月`
})

const monthDays = computed(() => {
  const year = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<{
    key: string
    day: number
    inMonth: boolean
    dateKey: string
    count: number
  }> = []

  for (let i = 0; i < startOffset; i += 1) {
    cells.push({
      key: `pad-start-${i}`,
      day: 0,
      inMonth: false,
      dateKey: '',
      count: 0,
    })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      key: dateKey,
      day,
      inMonth: true,
      dateKey,
      count: dateCounts.value.get(dateKey) || 0,
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `pad-end-${cells.length}`,
      day: 0,
      inMonth: false,
      dateKey: '',
      count: 0,
    })
  }

  return cells
})

watch(
  () => props.modelValue,
  (value) => {
    if (!value) return
    const [y, m] = value.split('-').map((part) => Number(part))
    if (!y || !m) return
    cursor.value = new Date(y, m - 1, 1)
  },
  { immediate: true },
)

function shiftMonth(delta: number) {
  const next = new Date(cursor.value)
  next.setMonth(next.getMonth() + delta, 1)
  cursor.value = next
}

function selectDate(dateKey: string) {
  emit('update:modelValue', dateKey)
}
</script>

<style scoped>
.browse-calendar {
  margin-top: 12px;
  padding: 12px;
}

.browse-calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.browse-calendar-title {
  font-size: 13px;
  font-weight: 600;
}

.browse-calendar-weekdays,
.browse-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.browse-calendar-weekdays {
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--sa-muted);
  text-align: center;
}

.browse-calendar-day {
  position: relative;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--sa-text);
  font-size: 12px;
  cursor: pointer;
}

.browse-calendar-day.muted {
  visibility: hidden;
}

.browse-calendar-day.hasPosts {
  background: color-mix(in srgb, var(--sa-accent) 12%, transparent);
}

.browse-calendar-day.selected {
  border-color: var(--sa-accent);
  background: color-mix(in srgb, var(--sa-accent) 22%, transparent);
}

.browse-calendar-day:disabled {
  cursor: default;
}

.day-num {
  display: block;
  line-height: 1.2;
}

.day-count {
  display: block;
  font-size: 10px;
  color: var(--sa-muted);
}

.browse-calendar-clear {
  width: 100%;
  margin-top: 8px;
}
</style>
