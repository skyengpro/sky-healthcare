<template>
  <!-- stock as a blister strip: filled pockets = stock, against three times the minimum level -->
  <div class="flex items-center gap-[3px]" :title="title" role="img" :aria-label="title">
    <span v-for="i in cells" :key="i" class="block h-[9px] rounded-full transition-colors"
      :class="[size === 'lg' ? 'w-[18px] h-[10px]' : 'w-[13px]', i <= filled ? tone + ' shadow-[inset_0_1px_0_rgb(255_255_255/.35)]' : 'bg-line-strong/70 shadow-[inset_0_1px_1px_rgb(0_0_0/.06)]']" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '@/i18n'

const props = defineProps({ stock: Number, minimum: Number, cells: { type: Number, default: 8 }, size: String })
const full = computed(() => Math.max((props.minimum || 0) * 3, 1))
const filled = computed(() => (props.stock > 0 ? Math.max(1, Math.min(props.cells, Math.round((props.stock / full.value) * props.cells))) : 0))
const tone = computed(() => (props.stock <= 0 ? '' : props.stock <= props.minimum ? 'bg-warn-mid' : 'bg-apo-mid'))
const title = computed(() => t('{0} in stock, minimum {1}', props.stock, props.minimum))
</script>
