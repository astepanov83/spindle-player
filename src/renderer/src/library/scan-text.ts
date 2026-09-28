// The scan status lines for the settings sheet and the empty library.
import type { ScanStatus } from '../../../shared/library'

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
  if (s.scanFailed && s.phase === 'idle' && !s.unavailable) lines.push(scanFailedText)
  return lines
}

// Rescan does something only with folders, a library process, and no scan running.
export function canRescan(s: ScanStatus): boolean {
  return !!s.folders.length && s.phase === 'idle' && !s.unavailable && !s.settingsUnreadable
}
