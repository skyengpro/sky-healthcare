// Light / dark / system theme. The choice is kept on the device; `system` follows the phone setting.
import { ref } from 'vue'

const KEY = 'sky_healthcare.theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
export const themeMode = ref(read())
export const isDark = ref(false)

function read() {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

function apply() {
  isDark.value = themeMode.value === 'dark' || (themeMode.value === 'system' && media.matches)
  const root = document.documentElement
  root.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  root.style.colorScheme = isDark.value ? 'dark' : 'light'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', isDark.value ? '#151614' : '#f6f5f1')
}

export function setTheme(mode) {
  themeMode.value = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {}
  apply()
}

media.addEventListener?.('change', apply)
apply()
