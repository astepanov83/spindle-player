// Generated covers for the fake albums, drawn once on a canvas.
export type CoverStyle = 'sun' | 'stripes' | 'orbs' | 'grid' | 'waves'

function rng(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cache = new Map<string, string>()

export function makeCover(p: [string, string, string], style: CoverStyle, i: number): string {
  const key = `${style}:${i}:${p.join()}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 400
  const x = c.getContext('2d')!
  const r = rng(i * 977 + 13)
  const [a, b, d] = p
  x.fillStyle = d
  x.fillRect(0, 0, 400, 400)
  if (style === 'sun') {
    const g = x.createLinearGradient(0, 0, 0, 400)
    g.addColorStop(0, d)
    g.addColorStop(1, a)
    x.fillStyle = g
    x.fillRect(0, 0, 400, 400)
    x.fillStyle = b
    x.beginPath()
    x.arc(200, 250, 110, Math.PI, 0)
    x.fill()
    x.fillStyle = d
    for (let k = 0; k < 7; k++) x.fillRect(0, 250 + k * k * 3 + k * 6, 400, 3 + k * 1.6)
  } else if (style === 'stripes') {
    x.save()
    x.translate(200, 200)
    x.rotate(-Math.PI / 4 + r() * 0.3)
    for (let k = -12; k < 12; k++) {
      x.fillStyle = [a, b, d][(k + 12) % 3]
      x.globalAlpha = 0.55 + r() * 0.45
      x.fillRect(k * 34, -400, 20 + r() * 16, 800)
    }
    x.restore()
    x.globalAlpha = 1
  } else if (style === 'orbs') {
    for (let k = 0; k < 7; k++) {
      x.globalAlpha = 0.75
      x.fillStyle = [a, b][k % 2]
      x.beginPath()
      x.arc(40 + r() * 320, 40 + r() * 320, 30 + r() * 110, 0, 7)
      x.fill()
    }
    x.globalAlpha = 1
  } else if (style === 'grid') {
    x.fillStyle = a
    x.fillRect(0, 0, 400, 400)
    for (let gx = 0; gx < 5; gx++)
      for (let gy = 0; gy < 5; gy++) {
        const v = r()
        x.fillStyle = v < 0.35 ? b : v < 0.7 ? d : a
        if (v < 0.5) x.fillRect(gx * 80, gy * 80, 80, 80)
        else {
          x.beginPath()
          x.arc(gx * 80 + 40, gy * 80 + 40, 34, 0, 7)
          x.fill()
        }
      }
  } else {
    x.fillStyle = b
    x.fillRect(0, 0, 400, 400)
    x.lineWidth = 14
    for (let k = 0; k < 11; k++) {
      x.strokeStyle = k % 2 ? a : d
      x.beginPath()
      const ph = r() * 6
      const amp = 10 + r() * 22
      for (let px = 0; px <= 400; px += 8) {
        const py = 30 + k * 36 + Math.sin(px / 45 + ph) * amp
        if (px) x.lineTo(px, py)
        else x.moveTo(px, py)
      }
      x.stroke()
    }
  }
  const img = x.getImageData(0, 0, 400, 400)
  for (let q = 0; q < img.data.length; q += 4) {
    const n = (r() - 0.5) * 18
    img.data[q] += n
    img.data[q + 1] += n
    img.data[q + 2] += n
  }
  x.putImageData(img, 0, 0)
  const url = c.toDataURL('image/jpeg', 0.85)
  cache.set(key, url)
  return url
}
