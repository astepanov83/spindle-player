import { describe, expect, it } from 'vitest'
import { fallbackPalettes } from '../../../shared/palette'
import { backNote, heardAt, historyRows, msToMidnight } from './history'

const at = (d: number, h: number, m: number): number => new Date(2026, 8, d, h, m).getTime()
const now = at(30, 22, 0)

describe('a live item’s recent songs (031)', () => {
  it('shows the time for today, the day for older titles', () => {
    expect(heardAt(at(30, 21, 4), now)).toBe('21:04')
    expect(heardAt(at(30, 0, 5), now)).toBe('00:05')
    expect(heardAt(at(28, 21, 4), now)).toBe('28 Sep')
  })

  it('lists newest first and marks the one on air while sound is wanted', () => {
    const list = [
      { at: at(30, 21, 8), title: 'Holy Diver', subtitle: 'Dio' },
      { at: at(30, 21, 14), title: 'Powerslave', subtitle: 'Iron Maiden', now: true }
    ]
    const rows = historyRows(list, true, now)
    expect(rows.map((r) => [r.time, r.subtitle, r.title, r.now])).toEqual([
      ['21:14', 'Iron Maiden', 'Powerslave', true],
      ['21:08', 'Dio', 'Holy Diver', false]
    ])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
    expect(historyRows(list, false, now)[0].now).toBe(false)
  })

  it('gives a row its song’s small cover, or none', () => {
    const art = { palette: fallbackPalettes('x'), cover: 'spindle://cover/small/b', coverLarge: '' }
    const rows = historyRows(
      [
        { at: 1, title: 'J' },
        { at: 2, title: 'B', art }
      ],
      false,
      now
    )
    expect(rows.map((r) => r.cover)).toEqual(['spindle://cover/small/b', ''])
  })

  it('waits until the next midnight to turn times into days', () => {
    expect(msToMidnight(at(30, 23, 59))).toBe(60_000)
    expect(msToMidnight(at(30, 0, 0))).toBe(86_400_000)
  })

  it('says where the queue came from and how long it is', () => {
    expect(backNote('Late Night', 42)).toBe('From Late Night, 42 songs')
    expect(backNote('Powerslave', 1)).toBe('From Powerslave, 1 song')
    expect(backNote('', 1200)).toBe('1,200 songs')
    expect(backNote('Late Night', 0)).toBe('The queue is empty')
  })
})
