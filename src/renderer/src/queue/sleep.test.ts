import { describe, expect, it } from 'vitest'
import type { ItemKey } from '../../../shared/plugins/items'
import type { EndStep, QueueState } from './logic'
import {
  leftText,
  pickOf,
  setAt,
  shownOf,
  sleepHeading,
  sleepRows,
  stopsAfter,
  timedStep,
  type SleepRow
} from './sleep'

const min = 60_000

describe('a timed timer', () => {
  it('ends that many minutes from now', () => {
    expect(setAt(30, 1000)).toEqual({ pick: 30, end: 1000 + 30 * min })
    expect(setAt('song', 1000)).toEqual({ pick: 'song' })
  })

  it('waits, fades over its last 20 s, then ends', () => {
    const end = 10 * min
    expect(timedStep(end, end - 21_000)).toBe('wait')
    expect(timedStep(end, end - 20_000)).toBe('fade')
    expect(timedStep(end, end - 1)).toBe('fade')
    expect(timedStep(end, end)).toBe('end')
    // a computer that slept past it
    expect(timedStep(end, end + 3600_000)).toBe('end')
  })

  it('shows the minutes left, rounded up, then seconds in the last one', () => {
    const s = setAt(30, 0)
    expect(leftText(s, 0)).toBe('30m')
    expect(leftText(s, 7 * min + 1)).toBe('23m')
    expect(leftText(s, 29 * min)).toBe('1m')
    expect(leftText(s, 29 * min + 15_000)).toBe('45s')
    expect(leftText(s, 31 * min)).toBe('0s')
    expect(leftText(setAt('album', 0), 0)).toBe('album')
    expect(shownOf(s, 7 * min)).toEqual({ pick: 30, left: '23m' })
    expect(shownOf(undefined, 0)).toBeUndefined()
  })
})

describe('stopsAfter', () => {
  const k = (id: string): ItemKey => `t:${id}` as ItemKey
  // songs a0, a1 of album A, b0 of album B, n0 and n1 with none
  const album = (key: ItemKey): string | undefined =>
    key.startsWith('t:n') ? undefined : key.slice(2, 3).toUpperCase()
  const to = (id: string): EndStep => {
    const state: QueueState = { items: [k('a0'), k(id)], index: 1 }
    return { kind: 'play', state }
  }
  const stop: EndStep = { kind: 'stop' }
  const replay: EndStep = { kind: 'replay' }

  it('nothing set or a timed one: never', () => {
    expect(stopsAfter(undefined, to('b0'), k('a0'), album)).toBe(false)
    expect(stopsAfter(setAt(15, 0), to('b0'), k('a0'), album)).toBe(false)
  })

  it('end of song: at any end', () => {
    const s = setAt('song', 0)
    expect(stopsAfter(s, to('a1'), k('a0'), album)).toBe(true)
    expect(stopsAfter(s, replay, k('a0'), album)).toBe(true)
    expect(stopsAfter(s, stop, k('a0'), album)).toBe(true)
  })

  it('end of album: when the next song is of another album, or none', () => {
    const s = setAt('album', 0)
    expect(stopsAfter(s, to('a1'), k('a0'), album)).toBe(false)
    expect(stopsAfter(s, to('b0'), k('a0'), album)).toBe(true)
    expect(stopsAfter(s, to('n0'), k('a0'), album)).toBe(true)
    expect(stopsAfter(s, stop, k('a0'), album)).toBe(true)
    // repeat: the album would never end
    expect(stopsAfter(s, replay, k('a0'), album)).toBe(true)
    // a song with no album is an album of one
    expect(stopsAfter(s, to('n1'), k('n0'), album)).toBe(true)
  })
})

const idOf = (r: SleepRow): string => (r === 'line' ? r : r.id)

describe('the menu', () => {
  it('has every choice, and Cancel only while set', () => {
    expect(sleepRows(undefined, { live: false, shuffle: 'off' })).toEqual([
      { id: 'sleep:song', label: 'End of this song', checked: false },
      { id: 'sleep:album', label: 'End of this album', checked: false },
      { id: 'sleep:15', label: '15 minutes', checked: false },
      { id: 'sleep:30', label: '30 minutes', checked: false },
      { id: 'sleep:45', label: '45 minutes', checked: false },
      { id: 'sleep:60', label: '60 minutes', checked: false },
      { id: 'sleep:90', label: '90 minutes', checked: false }
    ])
    const rows = sleepRows(setAt(45, 0), { live: false, shuffle: 'off' })
    expect(rows[4]).toMatchObject({ label: '45 minutes', checked: true })
    expect(rows.slice(-2)).toEqual(['line', { id: 'sleep:off', label: 'Cancel' }])
  })

  it('has no song or album end for a live item', () => {
    expect(sleepRows(undefined, { live: true, shuffle: 'off' }).map(idOf)).toEqual([
      'sleep:15',
      'sleep:30',
      'sleep:45',
      'sleep:60',
      'sleep:90'
    ])
    expect(sleepRows(undefined, { live: true, shuffle: 'songs' }).map(idOf)[0]).toBe('sleep:15')
  })

  it('has the album end with album shuffle, which plays each album to its end', () => {
    expect(sleepRows(undefined, { live: false, shuffle: 'albums' }).map(idOf)).toContain(
      'sleep:album'
    )
  })

  it('has no album end with song shuffle, which picks the next song at random', () => {
    expect(sleepRows(undefined, { live: false, shuffle: 'songs' }).map(idOf)).toEqual([
      'sleep:song',
      'sleep:15',
      'sleep:30',
      'sleep:45',
      'sleep:60',
      'sleep:90'
    ])
  })

  it('says what is left in its heading', () => {
    expect(sleepHeading(undefined, 0)).toBe('Sleep timer')
    expect(sleepHeading(setAt(30, 0), 7 * min)).toBe('Sleep timer: 23 min left')
    expect(sleepHeading(setAt(30, 0), 30 * min - 45_000)).toBe('Sleep timer: 45 s left')
    expect(sleepHeading(setAt('song', 0), 0)).toBe('Sleep timer: end of this song')
  })

  it('reads a row back', () => {
    expect(pickOf('sleep:60')).toBe(60)
    expect(pickOf('sleep:album')).toBe('album')
    expect(pickOf('sleep:off')).toBeNull()
    expect(pickOf('sleep:7')).toBeUndefined()
    expect(pickOf(null)).toBeUndefined()
  })
})
