// The scan status lines for the settings sheet and the empty library.
import type { DropResult } from '../../../../shared/plugins/files/ipc'
import type { FetchStatus, GroupsStatus, ScanStatus } from '../../../../shared/library'
import { rootName } from './folders'
import { pathEnds } from '../../ui/path-ends'

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
  if (s.phase === 'walk')
    return `Looking for files: ${n(s.done)} found` + (s.read ? `, ${n(s.read)} read` : '')
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
  const found = `${n(f.found)} of ${n(total)}`
  // "Found 3 of 40" alone did not say covers were still being fetched (ticket 019)
  const parts = [fetchBusy(f) === 'covers' ? `Looking up covers: found ${found}` : `Found ${found}`]
  if (f.notFound) parts.push(`${n(f.notFound)} not found`)
  if (f.left) parts.push(`${n(f.left)} left`)
  return parts.join(' · ')
}

// Which line gets the spinner: what main says the lookup is on now. Albums
// left for later still count as left, so the counts can't tell.
export function fetchBusy(f: FetchStatus | undefined): 'covers' | 'photos' | undefined {
  if (!f?.running) return undefined
  return f.phase === 'photos' && f.artists ? 'photos' : 'covers'
}

// The artist photos line under it (ticket 021); none while Deezer is off.
export function photoLine(f: FetchStatus | undefined): string | undefined {
  const a = f?.artists
  const total = a ? a.found + a.notFound + a.left : 0
  if (!a || !total) return undefined
  const found = `found ${n(a.found)} of ${n(total)}`
  const parts = [
    fetchBusy(f) === 'photos' ? `Looking up artist photos: ${found}` : `Artist photos: ${found}`
  ]
  if (a.notFound) parts.push(`${n(a.notFound)} not found`)
  if (a.left) parts.push(`${n(a.left)} left`)
  return parts.join(' · ')
}

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const sameDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString()

// The artist groups task's line under its switch (ticket 068).
export function groupsLine(
  g: GroupsStatus | undefined,
  now = Date.now()
): { text: string; busy?: true; error?: true } | undefined {
  if (!g) return undefined
  switch (g.state) {
    case 'running':
      return { text: `Checked ${n(g.checked)} of ${n(g.total)} names`, busy: true }
    case 'done':
      return { text: `Grouped ${plural(g.grouped, 'artist', 'artists')}, ${clock(g.at)}` }
    case 'limit': {
      const when =
        g.at === undefined
          ? 'after the next scan'
          : sameDay(g.at, now)
            ? `at ${clock(g.at)}`
            : sameDay(g.at, now + 24 * 3600_000)
              ? 'tomorrow'
              : `${new Date(g.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      return { text: `Waiting for the limit. Will go on ${when}.` }
    }
    case 'stopped':
      return {
        text:
          g.error === 'network'
            ? 'Could not reach the service. Will try again after the next scan.'
            : 'The service gave no usable answer. Will try again after the next scan.',
        error: true
      }
  }
}

// What the main window says when a scan ends badly (ticket 045): the scan
// failed, or a music folder was not found. Each new status goes to `next`;
// a folder is named once each time it goes missing, not on every scan.
export class ScanWatch {
  #last: ScanStatus
  // what the last scan that ended did not find
  #missing: string[]

  constructor(start: ScanStatus) {
    this.#last = start
    this.#missing = start.missing
  }

  next(s: ScanStatus): string | undefined {
    const before = this.#last
    this.#last = s
    // a scan clears the list while it runs, so only the end counts
    const ended = s.phase === 'idle' && before.phase !== 'idle'
    const gone = ended ? s.missing.filter((f) => !this.#missing.includes(f)) : []
    if (ended) this.#missing = s.missing
    // the library as a whole has its own message (libraryProblem)
    if (s.unavailable) return undefined
    if (s.scanFailed && !before.scanFailed) return 'The scan failed'
    // its own name: the notice cuts a long path at the end
    if (gone.length === 1) return `Music folder not found: ${folderName(gone[0])}`
    if (gone.length) return `${n(gone.length)} music folders not found`
    return undefined
  }
}

// The last folder of a path, for a line too short for all of it.
function folderName(path: string): string {
  return pathEnds(path)[1].replace(/^[/\\]|[/\\]$/g, '') || path
}

// The notice after folders were dropped on the window (ticket 047).
export function dropText(r: DropResult): string | undefined {
  if (r.unreadable) return settingsText
  if (r.added.length === 1) return `Added ${rootName(r.added[0])} to music folders`
  if (r.added.length) return `Added ${n(r.added.length)} music folders`
  if (r.known === 1) return 'That folder is a music folder already'
  if (r.known) return 'Those folders are music folders already'
  if (r.other) return 'Drop a folder to add it to music folders'
  return undefined
}
