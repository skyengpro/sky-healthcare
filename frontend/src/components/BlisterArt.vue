<template>
  <!-- a blister sheet with a few pockets already pushed out: the app's signature -->
  <svg viewBox="0 0 420 640" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="sheet" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".16" />
        <stop offset="1" stop-color="#ffffff" stop-opacity=".05" />
      </linearGradient>
      <linearGradient id="capA" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#e4dccb" />
      </linearGradient>
      <linearGradient id="capB" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b6dac8" />
        <stop offset="1" stop-color="#78ae95" />
      </linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#0b241d" flood-opacity=".35" />
      </filter>
    </defs>
    <rect x="10" y="10" width="400" height="620" rx="54" fill="url(#sheet)" stroke="#ffffff" stroke-opacity=".22" />
    <line x1="210" y1="40" x2="210" y2="600" stroke="#ffffff" stroke-opacity=".1" stroke-dasharray="4 8" />
    <g v-for="(cell, i) in cells" :key="i">
      <rect :x="cell.x - 6" :y="cell.y - 6" width="152" height="80" rx="40" fill="#0b241d" fill-opacity=".18" />
      <template v-if="cell.taken">
        <rect :x="cell.x" :y="cell.y" width="140" height="68" rx="34" stroke="#ffffff" stroke-opacity=".35" stroke-width="2" stroke-dasharray="7 7" />
      </template>
      <g v-else filter="url(#soft)">
        <rect :x="cell.x" :y="cell.y" width="140" height="68" rx="34" fill="url(#capA)" />
        <path :d="`M${cell.x + 70} ${cell.y} H${cell.x + 106} A34 34 0 0 1 ${cell.x + 106} ${cell.y + 68} H${cell.x + 70} Z`" fill="url(#capB)" />
        <rect :x="cell.x + 14" :y="cell.y + 10" width="44" height="10" rx="5" fill="#ffffff" fill-opacity=".7" />
      </g>
    </g>
  </svg>
</template>

<script setup>
const taken = new Set([1, 4, 5])
const cells = Array.from({ length: 10 }, (_, i) => ({ x: i % 2 ? 236 : 44, y: 54 + Math.floor(i / 2) * 112, taken: taken.has(i) }))
</script>
