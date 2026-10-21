// Writes assets/brand/castly-mark.svg from geometry, then renders every app icon PNG
// from the mark. Run: node scripts/generate-brand-assets.mjs
import { Resvg } from "@resvg/resvg-js"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const brandDir = join(root, "assets/brand")
const imagesDir = join(root, "assets/images")

const INK = "#0E0F13"
const GOLD = "#F5B83D"

const r2 = (n) => Math.round(n * 100) / 100
const polar = (cx, cy, radius, deg) => {
  const rad = (deg * Math.PI) / 180
  return [r2(cx + radius * Math.cos(rad)), r2(cy - radius * Math.sin(rad))]
}

/**
 * Mark on a 64 grid: a heavy "C" whose upper arm leaves the curve on its tangent
 * as a straight clapper stick, split from the ring by a hinge gap and cut by two
 * slanted stripes.
 */
function markGeometry() {
  const cx = 31
  const cy = 37
  const outer = 22
  const inner = 11
  const start = 118
  const end = -40

  const [ox1, oy1] = polar(cx, cy, outer, start)
  const [ix1, iy1] = polar(cx, cy, inner, start)
  const ring = { cx, cy, outer, inner, start, end }

  const tangent = ((start - 90) * Math.PI) / 180
  const dir = [Math.cos(tangent), -Math.sin(tangent)]
  const radial = [(ix1 - ox1) / (outer - inner), (iy1 - oy1) / (outer - inner)]
  const at = (t, s) => [r2(ox1 + dir[0] * t + radial[0] * s), r2(oy1 + dir[1] * t + radial[1] * s)]
  const thickness = outer - inner
  const hingeGap = 3
  const piece = 8
  const stripe = 3.5
  const lean = 3.5
  const segments = []
  for (let i = 0; i < 3; i++) {
    const from = hingeGap + i * (piece + stripe)
    const to = from + piece
    const last = i === 2
    segments.push([
      at(from + (i === 0 ? 0 : lean), 0),
      at(to + (last ? 0 : lean), 0),
      at(to, thickness),
      at(from, thickness),
    ])
  }
  return { ring, segments }
}

/** Geometry scaled and centred so the mark's bounding box fills 64 minus `margin`. */
function markPaths(margin = 3) {
  const { ring, segments } = markGeometry()
  const points = segments.flat()
  for (let deg = ring.start; deg <= ring.end + 360; deg += 2) {
    points.push(polar(ring.cx, ring.cy, ring.outer, deg))
  }
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const k = (64 - margin * 2) / Math.max(maxX - minX, maxY - minY)
  const mx = (minX + maxX) / 2
  const my = (minY + maxY) / 2
  const map = ([x, y]) => [r2((x - mx) * k + 32), r2((y - my) * k + 32)]

  const o1 = map(polar(ring.cx, ring.cy, ring.outer, ring.start))
  const o2 = map(polar(ring.cx, ring.cy, ring.outer, ring.end))
  const i2 = map(polar(ring.cx, ring.cy, ring.inner, ring.end))
  const i1 = map(polar(ring.cx, ring.cy, ring.inner, ring.start))
  const R = r2(ring.outer * k)
  const r = r2(ring.inner * k)
  const ringPath = `M${o1[0]} ${o1[1]} A${R} ${R} 0 1 0 ${o2[0]} ${o2[1]} L${i2[0]} ${i2[1]} A${r} ${r} 0 1 1 ${i1[0]} ${i1[1]} Z`
  const segmentPaths = segments.map((quad) => {
    const [a, b, c, d] = quad.map(map)
    return `M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} L${d[0]} ${d[1]} Z`
  })
  return [ringPath, ...segmentPaths]
}

function markSvg({ color = INK, size = 64, background, padding = 0 } = {}) {
  const view = 64 + padding * 2
  const paths = markPaths()
    .map((d) => `<path d="${d}"/>`)
    .join("")
  const bg = background
    ? `<rect x="${-padding}" y="${-padding}" width="${view}" height="${view}" fill="${background}"/>`
    : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-padding} ${-padding} ${view} ${view}">${bg}<g fill="${color}">${paths}</g></svg>`
}

function render(svg, width, out) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng()
  writeFileSync(out, png)
}

mkdirSync(brandDir, { recursive: true })
writeFileSync(join(brandDir, "castly-mark.svg"), markSvg({ color: "currentColor" }) + "\n")

const wordmark = readFileSync(join(brandDir, "castly-wordmark.svg"), "utf8")
const wordmarkView = wordmark.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
const wordmarkTransform = wordmark.match(/transform="([^"]+)"/)
const wordmarkPath = wordmark.match(/ d="([^"]+)"/)
writeFileSync(
  join(brandDir, "logo-paths.json"),
  JSON.stringify(
    {
      mark: { width: 64, height: 64, paths: markPaths() },
      wordmark: {
        width: Number(wordmarkView[1]),
        height: Number(wordmarkView[2]),
        transform: wordmarkTransform[1],
        path: wordmarkPath[1],
      },
    },
    null,
    2,
  ) + "\n",
)

// App icon: gold mark on ink, ~60% of the canvas.
render(markSvg({ color: GOLD, background: INK, padding: 22 }), 1024, join(imagesDir, "icon.png"))
// Splash image (shown centred on the ink splash background).
render(markSvg({ color: GOLD }), 512, join(imagesDir, "splash-icon.png"))
// Android adaptive icon: 108dp canvas, 66dp safe zone -> mark within the inner ~61%.
render(markSvg({ color: GOLD, padding: 21 }), 1024, join(imagesDir, "android-icon-foreground.png"))
render(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${INK}"/></svg>`,
  1024,
  join(imagesDir, "android-icon-background.png"),
)
render(markSvg({ color: "#FFFFFF", padding: 21 }), 1024, join(imagesDir, "android-icon-monochrome.png"))
render(markSvg({ color: GOLD, background: INK, padding: 8 }), 48, join(imagesDir, "favicon.png"))

if (process.argv.includes("--preview")) {
  const previewDir = join(root, ".brand-preview")
  mkdirSync(previewDir, { recursive: true })
  for (const size of [16, 24, 48, 256]) {
    render(markSvg({ color: INK, background: "#F7F3EC", padding: 4 }), size, join(previewDir, `mark-light-${size}.png`))
    render(markSvg({ color: GOLD, background: INK, padding: 4 }), size, join(previewDir, `mark-dark-${size}.png`))
  }
  render(wordmark.replace(/currentColor/g, INK), 600, join(previewDir, "wordmark.png"))
}
