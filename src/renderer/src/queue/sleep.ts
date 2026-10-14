// The sleep timer's rules (ticket 111), pure so they are tested. The timer
// itself is stores/sleep.svelte.ts; the queue asks stopsAfter at each end.
import type { ItemKey } from '../../../shared/plugins/items'
import type { ShuffleMode } from '../../../shared/shuffle'
import {
  sleepLabel,
  sleepPicks,
  sleepPicksFor,
  type SleepPick,
  type SleepShown
} from '../../../shared/sleep'
import type { EndStep } from './logic'

// A timed one fades out over this many seconds before it ends.
export const fadeSec = 20

// What is set: an end of song or album, or minutes ending at `end` (ms, Date.now).
export type SleepSet = { pick: 'song' | 'album' } | { pick: number; end: number }

export function setAt(pick: SleepPick, now: number): SleepSet {
  return typeof pick === 'number' ? { pick, end: now + pick * 60_000 } : { pick }
}

// What a timed one does at `now`. By the clock, not by a timeout, so a
// computer that slept past the time ends it as soon as it wakes.
export function timedStep(end: number, now: number): 'wait' | 'fade' | 'end' {
  if (now >= end) return 'end'
  return now >= end - fadeSec * 1000 ? 'fade' : 'wait'
}

// "23m", up to the minute; "45s" in the last one.
export function leftText(s: SleepSet, now: number): string {
  if (!('end' in s)) return s.pick
  const sec = Math.max(0, Math.ceil((s.end - now) / 1000))
  return sec < 60 ? `${sec}s` : `${Math.ceil(sec / 60)}m`
}

export function shownOf(s: SleepSet | undefined, now: number): SleepShown | undefined {
  return s && { pick: s.pick as SleepPick, left: leftText(s, now) }
}

// Whether the queue stops when the song playing ends, going to `step`.
// `album` gives a song's album page. End of album stops when the next song
// is of another album, or there is none; repeat counts as none, since the
// album would never end.
export function stopsAfter(
  s: SleepSet | undefined,
  step: EndStep,
  current: ItemKey,
  album: (key: ItemKey) => string | undefined
): boolean {
  if (!s || s.pick === 'song') return !!s
  if (s.pick !== 'album') return false
  if (step.kind !== 'play') return true
  const a = album(current)
  return !a || album(step.state.items[step.state.index]) !== a
}

// One row of the timer's menu; `id` is what pickOf reads back.
export type SleepRow = { id: string; label: string; checked?: boolean } | 'line'

// The choices that can be picked now (sleepPicksFor), the one set checked,
// and Cancel while one is set.
export function sleepRows(
  s: SleepSet | undefined,
  now: { live: boolean; shuffle: ShuffleMode }
): SleepRow[] {
  const rows: SleepRow[] = sleepPicksFor(now).map((p) => ({
    id: `sleep:${p}`,
    label: sleepLabel(p),
    checked: s?.pick === p
  }))
  return s ? [...rows, 'line', { id: 'sleep:off', label: 'Cancel' }] : rows
}

// The menu's heading: what is left, when set.
export function sleepHeading(s: SleepSet | undefined, now: number): string {
  if (!s) return 'Sleep timer'
  if (!('end' in s)) return `Sleep timer: ${sleepLabel(s.pick as SleepPick).toLowerCase()}`
  // the heading is in capitals: "23 MIN", not "23M"
  const left = leftText(s, now)
  return `Sleep timer: ${left.slice(0, -1)} ${left.endsWith('m') ? 'min' : 's'} left`
}

// A row's id back to its choice; null is Cancel, undefined not one of these.
export function pickOf(id: string | null): SleepPick | null | undefined {
  if (id === 'sleep:off') return null
  return sleepPicks.find((p) => `sleep:${p}` === id)
}
