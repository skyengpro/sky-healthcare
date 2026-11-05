// Renders the PWA icons and favicon from the SVG mark. Run: npm run icons
// (the wordmark logo.png is rendered with the real fonts by scripts/wordmark.html in a browser)
import sharp from 'sharp'
import fs from 'fs'

const mark = fs.readFileSync('public/logo-mark.svg')
const full = fs.readFileSync('scripts/logo-fullbleed.svg')
const jobs = [
  [mark, 192, 'public/icon-192.png'],
  [mark, 512, 'public/icon-512.png'],
  [full, 512, 'public/icon-maskable-512.png'],
  [full, 180, 'public/apple-touch-icon.png'],
  [mark, 64, 'public/favicon.png'],
]
for (const [svg, size, out] of jobs) {
  await sharp(svg, { density: 384 }).resize(size).png().toFile(out)
  console.log('wrote', out)
}
