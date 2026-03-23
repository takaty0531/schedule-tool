import sharp from 'sharp'
import { writeFileSync } from 'fs'

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

// 「FC」モノグラム — ForClassブランドカラー（白背景 + #2D6A4F）
// font: bold, tracking-tight スタイル（ホームのForClassと同じ）
function createIconSvg(size) {
  const radius = size * 0.2
  const fontSize = size * 0.42

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#FFFFFF"/>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
    font-family="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
    font-weight="700" font-size="${fontSize}" letter-spacing="-0.02em"
    fill="#2D6A4F">FC</text>
</svg>`
}

for (const { name, size } of sizes) {
  const svg = createIconSvg(size)
  await sharp(Buffer.from(svg))
    .png()
    .toFile(`public/${name}`)
  console.log(`Generated public/${name}`)
}

// favicon.svg も FC モノグラムに更新
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" ry="10" fill="#FFFFFF"/>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
    font-family="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
    font-weight="700" font-size="20" letter-spacing="-0.02em"
    fill="#2D6A4F">FC</text>
</svg>`
writeFileSync('public/favicon.svg', faviconSvg)
console.log('Updated public/favicon.svg')
