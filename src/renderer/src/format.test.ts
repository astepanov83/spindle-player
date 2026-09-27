import { expect, it } from 'vitest'
import { fmtTime } from './format'

it('formats seconds as m:ss', () => {
  expect(fmtTime(0)).toBe('0:00')
  expect(fmtTime(64.9)).toBe('1:04')
  expect(fmtTime(3725)).toBe('62:05')
})
