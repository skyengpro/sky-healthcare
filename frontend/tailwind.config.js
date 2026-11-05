import preset, { content } from 'frappe-ui/tailwind'

// PharmaStock tokens. Every colour is a CSS variable (see src/style.css) so light and dark themes
// share one set of class names. Warm paper, ink, one apothecary green; amber and red only for warnings.
const v = (name) => `rgb(var(--ps-${name}) / <alpha-value>)`

export default {
  presets: [preset],
  content: [...content, './index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Newsreader Variable"', 'Georgia', 'serif'],
        body: ['"Figtree Variable"', 'system-ui', 'sans-serif'],
        label: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: { DEFAULT: v('paper'), deep: v('paper-deep') },
        card: v('card'),
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), mute: v('ink-mute'), faint: v('ink-faint') },
        'on-ink': v('on-ink'),
        'on-apo': v('on-apo'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        apo: { DEFAULT: v('apo'), deep: v('apo-deep'), mid: v('apo-mid'), soft: v('apo-soft'), mist: v('apo-mist') },
        warn: { DEFAULT: v('warn'), mid: v('warn-mid'), soft: v('warn-soft') },
        alert: { DEFAULT: v('alert'), soft: v('alert-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--ps-shadow) / .05), 0 1px 1px rgb(var(--ps-shadow) / .03)',
        lift: '0 14px 34px -14px rgb(var(--ps-shadow) / .28), 0 2px 6px rgb(var(--ps-shadow) / .06)',
      },
    },
  },
}
