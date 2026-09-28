import { describe, expect, it } from 'vitest'
import { mergeMoves, type IdMoves } from '../shared/id-moves'
import { keepEarly } from './early'

// A channel the test sends on by hand.
function channel<T>(merge?: (a: T, b: T) => T): {
  send: (v: T) => void
  on: ReturnType<typeof keepEarly<T>>
} {
  let emit: (v: T) => void = () => {}
  const on = keepEarly<T>((fn) => (emit = fn), merge)
  return { send: (v) => emit(v), on }
}

describe('keepEarly', () => {
  it('keeps only the last early value by default', () => {
    const c = channel<number>()
    c.send(1)
    c.send(2)
    const got: number[] = []
    c.on((v) => got.push(v))
    c.send(3)
    expect(got).toEqual([2, 3])
  })

  it('joins early id maps, so the first is not lost', () => {
    const c = channel<IdMoves>(mergeMoves)
    c.send({ a: 'b' })
    c.send({ c: 'd' })
    const got: IdMoves[] = []
    c.on((v) => got.push(v))
    expect(got).toEqual([{ a: 'b', c: 'd' }])
  })

  it('keeps nothing once the page listens', () => {
    const c = channel<number>()
    const stop = c.on(() => {})
    c.send(1)
    stop()
    const got: number[] = []
    c.on((v) => got.push(v))
    expect(got).toEqual([])
  })
})
