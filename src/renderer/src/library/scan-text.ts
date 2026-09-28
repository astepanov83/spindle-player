// The scan status lines for the settings sheet and the empty library.
import type { FetchStatus, ScanStatus } from '../../../shared/library'

const n = (x: number): string => x.toLocaleString('en-US')
const plural = (x: number, one: string, many: string): string => `${n(x)} ${x === 1 ? one : many}`

export const notLoadedText = 'The library could not be loaded. Restart Spindle to try again.'
export const stoppedText = 'The library stopped working. Restart Spindle to play and scan again.'
export const settingsText =
  "Settings could not be read, so music folders can't be changed or scanned this run."
export const scanFailedText = 'The last scan failed. Press Rescan to try again.'

// What is wrong with the library as a whole, if anything. `pageFailed`: the
// page itself could not read what main sent.
export function libraryProblem(s: ScanStatus, pageFailed: boolean): string | undefined {
  if (pageFailed || s.unavailable === 'not-loaded') return notLoadedText
  if (s.unavailable === 'stopped') return stoppedText
  return undefined
}

export function scanLine(s: ScanStatus): string {
  if (s.phase === 'walk') return `Looking for files: ${n(s.done)} found`
  if (s.phase === 'read') return `Reading tags: ${n(s.done)} of ${n(s.total)}`
  if (!s.folders.length) return 'No music folders yet.'
  const parts = [`${plural(s.tracks, 'song', 'songs')} in ${plural(s.albums, 'album', 'albums')}`]
  if (s.failed) parts.push(`${plural(s.failed, 'file', 'files')} could not be read`)
  if (s.missing.length) parts.push(`${plural(s.missing.length, 'folder', 'folders')} not found`)
  return parts.join(' · ')
}

// Every line for the settings sheet: the problem or the scan line, then notices.
// With no library process, Rescan can't help, so it isn't offered.
export function statusLines(s: ScanStatus, pageFailed: boolean): string[] {
  const problem = libraryProblem(s, pageFailed)
  const lines: string[] = []
  if (problem) lines.push(problem)
  // the folder list is unknown then, so "no folders" would be wrong
  else if (!(s.settingsUnreadable && !s.folders.length && s.phase === 'idle'))
    lines.push(scanLine(s))
  if (s.settingsUnreadable) lines.push(settingsText)
  if (s.scanFailed && s.phase === 'idle' && !problem) lines.push(scanFailedText)
  return lines
}

// Rescan is offered only with folders, no scan running, and no problem that
// says to restart (the process gave up, or the page could not read the library).
export function canRescan(s: ScanStatus, pageFailed: boolean): boolean {
  return (
    !!s.folders.length &&
    s.phase === 'idle' &&
    !libraryProblem(s, pageFailed) &&
    !s.settingsUnreadable
  )
}

// The online cover lookup's line in the settings sheet (ticket 014).
export function fetchLine(f: FetchStatus | undefined): string | undefined {
  if (!f) return undefined
  const total = f.found + f.notFound + f.left
  // not "every album has a cover": albums with no album tag are never looked up
  if (!total) return 'No albums to look up'
  // held until the scan ends
  if (!f.running && !f.found && !f.notFound)
    return `Waiting: ${plural(f.left, 'album', 'albums')} to look up`
  const parts = [`Found ${n(f.found)} of ${n(total)}`]
  if (f.notFound) parts.push(`${n(f.notFound)} not found`)
  if (f.left) parts.push(`${n(f.left)} left`)
  return parts.join(' · ')
}
