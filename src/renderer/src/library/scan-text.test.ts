import { describe, expect, it } from 'vitest'
import type { ScanStatus } from '../../../shared/library'
import {
  canRescan,
  libraryProblem,
  notLoadedText,
  scanFailedText,
  scanLine,
  settingsText,
  statusLines,
  stoppedText
} from './scan-text'

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

describe('libraryProblem', () => {
  it('says the library could not be loaded when it never was', () => {
    expect(libraryProblem(status({ unavailable: 'not-loaded' }), false)).toBe(notLoadedText)
    // the page could not read what main sent, whatever the status says
    expect(libraryProblem(status({}), true)).toBe(notLoadedText)
  })

  it('says the library stopped when it gave up after a good load', () => {
    expect(libraryProblem(status({ unavailable: 'stopped', tracks: 20 }), false)).toBe(stoppedText)
  })

  it('says nothing when all is well', () => {
    expect(libraryProblem(status({ tracks: 3 }), false)).toBeUndefined()
  })
})

describe('statusLines', () => {
  it('shows the problem instead of the totals', () => {
    expect(statusLines(status({ unavailable: 'stopped', tracks: 20 }), false)).toEqual([
      stoppedText
    ])
  })

  it('keeps a page-side failure when a new status comes', () => {
    expect(statusLines(status({ tracks: 20, albums: 2 }), true)).toEqual([notLoadedText])
  })

  it('adds a line for unreadable settings and a failed scan', () => {
    expect(statusLines(status({ tracks: 1, albums: 1, scanFailed: true }), false)).toEqual([
      '1 song in 1 album',
      scanFailedText
    ])
    expect(statusLines(status({ tracks: 1, albums: 1, settingsUnreadable: true }), false)).toEqual([
      '1 song in 1 album',
      settingsText
    ])
  })

  it('does not say "no folders" when the folder list could not be read', () => {
    expect(statusLines(status({ folders: [], settingsUnreadable: true }), false)).toEqual([
      settingsText
    ])
  })

  it('does not offer Rescan once the library process gave up', () => {
    expect(statusLines(status({ unavailable: 'stopped', scanFailed: true }), false)).toEqual([
      stoppedText
    ])
  })

  it('drops the failed-scan line while a new scan runs', () => {
    expect(statusLines(status({ phase: 'walk', done: 3, scanFailed: true }), false)).toEqual([
      'Looking for files: 3 found'
    ])
  })
})

describe('canRescan', () => {
  it('is on with folders, a library process and no scan running', () => {
    expect(canRescan(status({}))).toBe(true)
  })

  it('is off without folders, while scanning, with no library process, or unreadable settings', () => {
    for (const s of [
      { folders: [] },
      { phase: 'read' as const },
      { unavailable: 'stopped' as const },
      { unavailable: 'not-loaded' as const },
      { settingsUnreadable: true }
    ])
      expect(canRescan(status(s))).toBe(false)
  })
})
