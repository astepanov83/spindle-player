// The one-line scan status for the settings sheet and the empty library.
import type { ScanStatus } from '../../../shared/library'

const n = (x: number): string => x.toLocaleString('en-US')
const plural = (x: number, one: string, many: string): string => `${n(x)} ${x === 1 ? one : many}`

export function scanLine(s: ScanStatus): string {
  if (s.phase === 'walk') return `Looking for files: ${n(s.done)} found`
  if (s.phase === 'read') return `Reading tags: ${n(s.done)} of ${n(s.total)}`
  if (!s.folders.length) return 'No music folders yet.'
  const parts = [`${plural(s.tracks, 'song', 'songs')} in ${plural(s.albums, 'album', 'albums')}`]
  if (s.failed) parts.push(`${plural(s.failed, 'file', 'files')} could not be read`)
  if (s.missing.length) parts.push(`${plural(s.missing.length, 'folder', 'folders')} not found`)
  return parts.join(' · ')
}
