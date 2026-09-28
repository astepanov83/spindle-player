import { describe, expect, it } from 'vitest'
import type { ScanStatus } from '../../../shared/library'
import { scanLine } from './scan-text'

const status = (s: Partial<ScanStatus>): ScanStatus => ({
  folders: ['/m'],
  phase: 'idle',
  done: 0,
  total: 0,
  tracks: 0,
  albums: 0,
  failed: 0,
  missing: [],
  ...s
})

describe('scanLine', () => {
  it('says so when the library could not be loaded', () => {
    expect(scanLine(status({ unavailable: true, tracks: 0 }))).toBe(
      'The library could not be loaded. Restart Spindle to try again.'
    )
  })

  it('shows progress while scanning', () => {
    expect(scanLine(status({ phase: 'walk', done: 1234 }))).toBe('Looking for files: 1,234 found')
    expect(scanLine(status({ phase: 'read', done: 12, total: 5000 }))).toBe(
      'Reading tags: 12 of 5,000'
    )
  })

  it('shows the totals when done', () => {
    expect(scanLine(status({ tracks: 1, albums: 1 }))).toBe('1 song in 1 album')
    expect(scanLine(status({ tracks: 26800, albums: 2100, failed: 2, missing: ['/usb'] }))).toBe(
      '26,800 songs in 2,100 albums · 2 files could not be read · 1 folder not found'
    )
  })

  it('says when there are no folders', () => {
    expect(scanLine(status({ folders: [] }))).toBe('No music folders yet.')
  })
})
