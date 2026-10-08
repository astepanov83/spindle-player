// A canvas context for tests: it keeps what was drawn that a test checks,
// and measures text as one unit per character per font pixel.
import type { Ctx } from './drawing'

export interface Drawn {
  // lineWidth of each stroke, in order
  strokes: number[]
  texts: { text: string; x: number; y: number; font: string }[]
}

export function fakeCtx(): { x: Ctx; drawn: Drawn } {
  const drawn: Drawn = { strokes: [], texts: [] }
  const state: Record<string, unknown> = { font: '10px sans-serif', lineWidth: 1 }
  const size = (): number => Number(/(\d+(\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10)
  const calls: Record<string, (...a: never[]) => unknown> = {
    stroke: () => drawn.strokes.push(state.lineWidth as number),
    fillText: (text: string, x: number, y: number) =>
      drawn.texts.push({ text, x, y, font: String(state.font) }),
    measureText: (s: string) => ({ width: [...s].length * size() * 0.5 })
  }
  const x = new Proxy(state, {
    get: (t, k: string) => calls[k] ?? (k in t ? t[k] : () => undefined),
    set: (t, k: string, v) => {
      t[k] = v
      return true
    }
  }) as unknown as Ctx
  return { x, drawn }
}
