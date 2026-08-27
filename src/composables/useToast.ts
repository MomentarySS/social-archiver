export interface ToastItem {
  id: number
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  closing?: boolean
}

export interface ToastOptions {
  duration?: number
}

export interface ToastAPI {
  success(message: string, duration?: number): number
  error(message: string, duration?: number): number
  warning(message: string, duration?: number): number
  info(message: string, duration?: number): number
}

import { reactive } from 'vue'

export const toastItems = reactive<ToastItem[]>([])
let nextId = 1
const timers = new Map<number, number>()

export function removeToast(id: number) {
  const entry = toastItems.find((x) => x.id === id)
  if (!entry) return
  entry.closing = true
  setTimeout(() => {
    const index = toastItems.findIndex((x) => x.id === id)
    if (index >= 0) toastItems.splice(index, 1)
    timers.delete(id)
  }, 220)
}

function push(message: string, type: ToastItem['type'] = 'info', duration = 3200) {
  const id = nextId++
  toastItems.push({ id, message, type })
  if (duration > 0) {
    const timer = window.setTimeout(() => removeToast(id), duration)
    timers.set(id, timer)
  }
  return id
}

export function useToast(): ToastAPI {
  return {
    success: (message, duration) => push(message, 'success', duration),
    error: (message, duration) => push(message, 'error', duration),
    warning: (message, duration) => push(message, 'warning', duration),
    info: (message, duration) => push(message, 'info', duration),
  }
}
