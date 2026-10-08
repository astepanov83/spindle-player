import { describe, expect, it } from 'vitest'
import { decodeCurve, encodeCurve } from './loudness-text'

describe('loudness curve text', () => {
  it('is one character per value', () => {
    const text = encodeCurve(Array.from({ length: 32 }, (_, i) => i / 31))
    expect(text).toHaveLength(32)
    expect(text[0]).toBe('A')
    expect(text[31]).toBe('/')
  })

  it('reads back within one step of 1/63', () => {
    const values = [0, 0.1, 0.25, 0.5, 0.77, 1]
    const back = decodeCurve(encodeCurve(values))
    back.forEach((v, i) => expect(Math.abs(v - values[i])).toBeLessThanOrEqual(0.5 / 63 + 1e-9))
    expect(back[0]).toBe(0)
    expect(back[5]).toBe(1)
  })

  it('clamps values out of range and reads junk as 0', () => {
    expect(encodeCurve([-1, 2, NaN])).toBe('A/A')
    expect(decodeCurve('A-/')).toEqual([0, 0, 1])
    expect(decodeCurve('')).toEqual([])
  })

  it('is safe in JSON as it is', () => {
    const text = encodeCurve(Array.from({ length: 64 }, (_, i) => i / 63))
    expect(JSON.stringify(text)).toBe(`"${text}"`)
  })
})
