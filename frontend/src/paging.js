// Show long lists one page at a time instead of one endless scroll.
import { computed, ref, watch } from 'vue'

export function usePaged(list, size = 10) {
  const page = ref(1)
  const total = computed(() => list.value?.length || 0)
  const pages = computed(() => Math.max(1, Math.ceil(total.value / size)))
  const items = computed(() => (list.value || []).slice((page.value - 1) * size, page.value * size))
  // a new filter or search starts again on the first page
  watch(list, () => (page.value = Math.min(page.value, pages.value)))
  watch(() => total.value, () => (page.value = 1))
  return { page, pages, total, items, size }
}
