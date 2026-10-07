import { expect, it } from 'vitest'
import { fmtClock, fmtCount, fmtLength, fmtTime } from './format'

it('formats seconds as m:ss', () => {
  expect(fmtTime(0)).toBe('0:00')
  expect(fmtTime(64.9)).toBe('1:04')
  expect(fmtTime(3725)).toBe('62:05')
})

it('formats a long time as h:mm:ss, a short one as m:ss', () => {
  expect(fmtClock(0)).toBe('0:00')
  expect(fmtClock(754.6)).toBe('12:34')
  expect(fmtClock(3599)).toBe('59:59')
  expect(fmtClock(3600)).toBe('1:00:00')
  expect(fmtClock(4360)).toBe('1:12:40')
  // a clock read a moment early
  expect(fmtClock(-0.4)).toBe('0:00')
})

it('formats the length of a list in minutes, with hours past an hour', () => {
  expect(fmtLength(0)).toBe('0 min')
  expect(fmtLength(25)).toBe('under a minute')
  expect(fmtLength(59.5)).toBe('under a minute')
  expect(fmtLength(60)).toBe('1 min')
  expect(fmtLength(89)).toBe('1 min')
  expect(fmtLength(3900)).toBe('1 h 5 min')
  expect(fmtLength(125)).toBe('2 min')
  expect(fmtLength(3569)).toBe('59 min')
  expect(fmtLength(3600)).toBe('1 h')
  expect(fmtLength(3600 * 5 + 60 * 7 + 20)).toBe('5 h 7 min')
})

it('counts things with the word for one or many', () => {
  expect(fmtCount(1, 'album', 'albums')).toBe('1 album')
  expect(fmtCount(0, 'album', 'albums')).toBe('0 albums')
  expect(fmtCount(12000, 'song', 'songs')).toBe(`${(12000).toLocaleString()} songs`)
})
