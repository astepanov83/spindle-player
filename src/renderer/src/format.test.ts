import { expect, it } from 'vitest'
import { fmtClock, fmtTime } from './format'

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
