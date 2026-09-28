import { describe, expect, it } from 'vitest'
import { RateLimit } from './rate'

describe('RateLimit', () => {
  it('spaces requests by the gap', () => {
    let t = 1000
    const r = new RateLimit(3000, () => t)
    expect(r.take()).toBe(0)
    expect(r.take()).toBe(3000)
    expect(r.take()).toBe(6000)
    t = 20000
    expect(r.take()).toBe(0)
  })

  it('backs off for a minute after a 429, doubling up to an hour', () => {
    let t = 0
    const r = new RateLimit(100, () => t)
    r.take()
    r.tooMany()
    expect(r.take()).toBe(60000)
    t = 60100
    r.tooMany()
    expect(r.take()).toBe(120000)
    for (let i = 0; i < 10; i++) r.tooMany()
    t = 1e9
    r.tooMany()
    expect(r.take()).toBe(3600000)
  })

  it('starts the back-off over after a success', () => {
    let t = 0
    const r = new RateLimit(100, () => t)
    r.tooMany()
    r.tooMany()
    r.ok()
    t = 1e9
    r.tooMany()
    expect(r.take()).toBe(60000)
  })
})
