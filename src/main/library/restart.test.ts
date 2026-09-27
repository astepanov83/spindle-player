import { describe, expect, it } from 'vitest'
import { RestartBudget } from './restart'

describe('RestartBudget', () => {
  it('allows a few restarts, then gives up', () => {
    const b = new RestartBudget(3, 60000)
    expect([b.take(0), b.take(10), b.take(20), b.take(30)]).toEqual([true, true, true, false])
  })

  it('forgets restarts older than the window', () => {
    const b = new RestartBudget(2, 1000)
    b.take(0)
    b.take(500)
    expect(b.take(900)).toBe(false)
    expect(b.take(1600)).toBe(true)
  })
})
