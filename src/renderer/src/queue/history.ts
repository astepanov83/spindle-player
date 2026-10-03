// The Queue part's rows while a live item plays: the songs its plugin heard,
// newest first, under a "Back to queue" row (decision 147).
import type { HistoryEntry } from '../plugins/types'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// When a song was heard: "21:14" today, "28 Sep" before (radio keeps a
// station's titles for up to 30 days after its last play).
export function heardAt(at: number, now: number): string {
  const d = new Date(at)
  if (d.toDateString() !== new Date(now).toDateString()) {
    return `${d.getDate()} ${months[d.getMonth()]}`
  }
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ms until the next local midnight, when today's times turn into days
export function msToMidnight(now: number): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now
}

export interface HistoryRow {
  key: string
  time: string
  title: string
  subtitle: string
  // the title playing now
  now: boolean
  // the song's small cover, or ''
  cover: string
}

// Newest first. `playing`: sound is wanted, so the entry on air is marked.
export function historyRows(list: HistoryEntry[], playing: boolean, now: number): HistoryRow[] {
  return list
    .map((e) => ({
      key: `${e.at}:${e.subtitle ?? ''}:${e.title}`,
      time: heardAt(e.at, now),
      title: e.title,
      subtitle: e.subtitle ?? '',
      now: playing && !!e.now,
      cover: e.art?.cover ?? ''
    }))
    .reverse()
}

// What "Back to queue" goes back to: "From Late Night, 42 songs".
export function backNote(from: string, count: number): string {
  if (!count) return 'The queue is empty'
  const songs = `${count.toLocaleString('en-US')} ${count === 1 ? 'song' : 'songs'}`
  return from ? `From ${from}, ${songs}` : songs
}
