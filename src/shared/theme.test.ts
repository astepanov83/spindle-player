// The theme numbers main and the palette picking use must match the page's theme.css.
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { accentGround, windowBackground } from './theme'

const css = readFileSync(join(__dirname, '../renderer/src/assets/theme.css'), 'utf8')
const lightAt = css.indexOf('@media (prefers-color-scheme: light)')
const blocks = { dark: css.slice(0, lightAt), light: css.slice(lightAt) }

// rgba(r, g, b, a) over an opaque hex color, as a hex color
function over(rgba: string, under: string): string {
  const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number)
  return (
    '#' +
    [r, g, b]
      .map((c, i) => {
        const u = parseInt(under.slice(1 + i * 2, 3 + i * 2), 16)
        return Math.round(c * a + u * (1 - a))
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

function value(theme: 'dark' | 'light', name: string): string {
  const m = blocks[theme].match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`${name} not in the ${theme} part of theme.css`)
  return m[1].trim()
}

describe('theme.css and theme.ts', () => {
  for (const theme of ['dark', 'light'] as const)
    it(`${theme}: backgrounds, panel and tint match`, () => {
      const bg = value(theme, '--bg')
      expect(bg).toBe(windowBackground[theme])
      const g = accentGround[theme]
      expect(g.flat.slice(0, 3)).toEqual([
        bg,
        value(theme, '--bg-side'),
        value(theme, '--bg-title')
      ])
      expect(g.flat[3]).toBe(over(value(theme, '--panel'), bg))
      expect(value(theme, '--tint')).toBe(`${Math.round(g.tint * 100)}%`)
    })
})
