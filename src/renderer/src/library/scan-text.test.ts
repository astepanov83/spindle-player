import { describe, expect, it } from 'vitest'
import type { ScanStatus } from '../../../shared/library'
import {
  canRescan,
  fetchBusy,
  fetchLine,
  libraryProblem,
  photoLine,
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

  it('says only to restart when the page could not read the library', () => {
    expect(statusLines(status({ scanFailed: true }), true)).toEqual([notLoadedText])
    expect(canRescan(status({}), true)).toBe(false)
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
    expect(canRescan(status({}), false)).toBe(true)
  })

  it('is off without folders, while scanning, with no library process, or unreadable settings', () => {
    for (const s of [
      { folders: [] },
      { phase: 'read' as const },
      { unavailable: 'stopped' as const },
      { unavailable: 'not-loaded' as const },
      { settingsUnreadable: true }
    ])
      expect(canRescan(status(s), false)).toBe(false)
  })
})

describe('fetchLine', () => {
  it('shows nothing while the lookup is off', () => {
    expect(fetchLine(undefined)).toBeUndefined()
  })

  it('shows progress while running and totals after', () => {
    expect(fetchLine({ found: 212, notFound: 96, left: 32, running: true })).toBe(
      'Looking up covers: found 212 of 340 · 96 not found · 32 left'
    )
    expect(fetchLine({ found: 0, notFound: 0, left: 5, running: true })).toBe(
      'Looking up covers: found 0 of 5 · 5 left'
    )
    expect(fetchLine({ found: 212, notFound: 128, left: 0, running: false })).toBe(
      'Found 212 of 340 · 128 not found'
    )
    expect(fetchLine({ found: 1200, notFound: 0, left: 0, running: false })).toBe(
      'Found 1,200 of 1,200'
    )
  })

  it('says when there is nothing to look up, or it waits for a scan', () => {
    expect(fetchLine({ found: 0, notFound: 0, left: 0, running: false })).toBe(
      'No albums to look up'
    )
    expect(fetchLine({ found: 0, notFound: 0, left: 1, running: false })).toBe(
      'Waiting: 1 album to look up'
    )
  })
})

describe('artist photos in the lookup lines', () => {
  const artists = { found: 12, notFound: 3, left: 25 }

  it('shows no photo line while Deezer is off or there are no artists', () => {
    expect(photoLine({ found: 1, notFound: 0, left: 0, running: false })).toBeUndefined()
    expect(
      photoLine({
        found: 1,
        notFound: 0,
        left: 0,
        running: false,
        artists: { found: 0, notFound: 0, left: 0 }
      })
    ).toBeUndefined()
  })

  it('says covers are looked up while albums are left, then photos', () => {
    const covers = { found: 2, notFound: 1, left: 4, running: true, artists }
    expect(fetchBusy(covers)).toBe('covers')
    expect(fetchLine(covers)).toBe('Looking up covers: found 2 of 7 · 1 not found · 4 left')
    expect(photoLine(covers)).toBe('Artist photos: found 12 of 40 · 3 not found · 25 left')
    const photos = { ...covers, notFound: 5, left: 0, phase: 'photos' as const }
    expect(fetchBusy(photos)).toBe('photos')
    expect(fetchLine(photos)).toBe('Found 2 of 7 · 5 not found')
    expect(photoLine(photos)).toBe(
      'Looking up artist photos: found 12 of 40 · 3 not found · 25 left'
    )
  })

  it('puts the spinner on the photo line when main says so, with albums left for later', () => {
    const later = {
      found: 2,
      notFound: 1,
      left: 4,
      running: true,
      phase: 'photos' as const,
      artists
    }
    expect(fetchBusy(later)).toBe('photos')
    expect(fetchLine(later)).toBe('Found 2 of 7 · 1 not found · 4 left')
    expect(photoLine(later)).toBe(
      'Looking up artist photos: found 12 of 40 · 3 not found · 25 left'
    )
    expect(fetchBusy({ ...later, phase: 'covers' })).toBe('covers')
  })

  it('shows totals when done', () => {
    const done = {
      found: 2,
      notFound: 5,
      left: 0,
      running: false,
      artists: { found: 30, notFound: 10, left: 0 }
    }
    expect(fetchBusy(done)).toBeUndefined()
    expect(photoLine(done)).toBe('Artist photos: found 30 of 40 · 10 not found')
  })
})
