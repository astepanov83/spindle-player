import { describe, expect, it } from 'vitest'
import { Dropped, TurnQueue } from './queue'

// a job that ends when the test says
function later(): { promise: Promise<void>; open: () => void } {
  let open = (): void => {}
  const promise = new Promise<void>((r) => (open = r))
  return { promise, open }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('TurnQueue', () => {
  it('runs up to the limit at once, then the newest waiting first', async () => {
    const q = new TurnQueue(1, () => Promise.resolve())
    const order: string[] = []
    const first = later()
    const done = [
      q.run(
        async () => {
          order.push('a')
          await first.promise
        },
        () => true
      ),
      q.run(
        async () => void order.push('b'),
        () => true
      ),
      q.run(
        async () => void order.push('c'),
        () => true
      )
    ]
    await tick()
    expect(order).toEqual(['a'])
    first.open()
    await Promise.all(done)
    expect(order).toEqual(['a', 'c', 'b'])
  })

  it('drops a job nobody wants by its turn, and goes on with the rest', async () => {
    const q = new TurnQueue(1, () => Promise.resolve())
    const first = later()
    let wanted = true
    const ran: string[] = []
    const a = q.run(
      () => first.promise,
      () => true
    )
    const b = q.run(
      async () => void ran.push('b'),
      () => wanted
    )
    const c = q.run(
      async () => void ran.push('c'),
      () => true
    )
    wanted = false
    first.open()
    await a
    await c
    await expect(b).rejects.toBeInstanceOf(Dropped)
    expect(ran).toEqual(['c'])
  })

  it('checks again after the wait for idle time', async () => {
    let wanted = true
    const q = new TurnQueue(2, async () => {
      wanted = false
    })
    await expect(
      q.run(
        async () => 1,
        () => wanted
      )
    ).rejects.toBeInstanceOf(Dropped)
  })
})
