import { describe, expect, it } from 'vitest'
import { loudGapMs, PaceTimer, publishGapMs, PublishTimer } from './publish'

describe('publishGapMs', () => {
  it('is 1s for a small library and grows to 5s at 50k songs', () => {
    expect(publishGapMs(300, 0)).toBe(1000)
    expect(publishGapMs(10000, 0)).toBe(1000)
    expect(publishGapMs(30000, 0)).toBe(3000)
    expect(publishGapMs(50000, 0)).toBe(5000)
    expect(publishGapMs(200000, 0)).toBe(5000)
  })

  it('keeps the library process busy with it a tenth of the time at most', () => {
    expect(publishGapMs(300, 400)).toBe(4000)
    expect(publishGapMs(50000, 900)).toBe(9000)
  })
})

// A clock and timers the test moves by hand.
function fakeTime(): {
  now: () => number
  setTimer: (f: () => void, ms: number) => () => void
  advance: (ms: number) => void
} {
  let t = 0
  let timers: { at: number; f: () => void }[] = []
  return {
    now: () => t,
    setTimer: (f, ms) => {
      const timer = { at: t + ms, f }
      timers.push(timer)
      return () => (timers = timers.filter((x) => x !== timer))
    },
    advance: (ms) => {
      const end = t + ms
      for (;;) {
        const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        timers = timers.filter((x) => x !== due)
        t = due.at
        due.f()
      }
      t = end
    }
  }
}

describe('PublishTimer', () => {
  function setup(
    tracks = 100,
    cost = 0
  ): {
    timer: PublishTimer
    time: ReturnType<typeof fakeTime>
    sent: number[]
  } {
    const time = fakeTime()
    const sent: number[] = []
    const timer = new PublishTimer({
      publish: () => {
        sent.push(time.now())
        time.advance(cost)
      },
      tracks: () => tracks,
      now: time.now,
      setTimer: time.setTimer
    })
    return { timer, time, sent }
  }

  it('sends the first change soon, then waits the gap, with one send per gap', () => {
    const { timer, time, sent } = setup()
    timer.soon()
    time.advance(100)
    timer.soon()
    time.advance(200)
    expect(sent).toEqual([250])
    for (let i = 0; i < 10; i++) {
      timer.soon()
      time.advance(100)
    }
    expect(sent).toEqual([250, 1250])
  })

  it('sends at once when asked, and drops the send it had planned', () => {
    const { timer, time, sent } = setup()
    timer.soon()
    time.advance(100)
    timer.now()
    time.advance(5000)
    expect(sent).toEqual([100])
  })

  it('waits longer after a send that took long', () => {
    const { timer, time, sent } = setup(100, 300)
    timer.soon()
    time.advance(300)
    timer.soon()
    time.advance(10000)
    // the first took 300ms, so the next comes 3s after it ended
    expect(sent).toEqual([250, 3550])
  })
})

describe('loudGapMs', () => {
  it('is 1s for a small library and 30s from 30k songs', () => {
    expect(loudGapMs(400)).toBe(1000)
    expect(loudGapMs(5000)).toBe(5000)
    expect(loudGapMs(42900)).toBe(30000)
  })
})

describe('PaceTimer', () => {
  it('runs at once after a quiet spell, then once per gap for many asks', () => {
    const time = fakeTime()
    const runs: number[] = []
    const pace = new PaceTimer({
      run: () => runs.push(time.now()),
      gapMs: () => 30000,
      now: time.now,
      setTimer: time.setTimer
    })
    pace.soon()
    time.advance(0)
    expect(runs).toEqual([0])
    // an album done every second
    for (let i = 0; i < 65; i++) {
      time.advance(1000)
      pace.soon()
    }
    time.advance(0)
    expect(runs).toEqual([0, 30000, 60000])
    time.advance(100000)
    expect(runs).toEqual([0, 30000, 60000, 90000])
    pace.soon()
    time.advance(0)
    expect(runs).toEqual([0, 30000, 60000, 90000, 165000])
  })
})
