// When to load the next song into the other <audio> element, and when to
// start it so it begins as this one ends (ticket 087). Plain functions; the
// engine reads the elements and acts on what they say.

// The next song loads this long before the end. Enough for a slow disk or a
// NAS, and late enough that skipping through songs doesn't load each next one.
export const preloadSec = 20
// From this close to the end, timers wait for the start, reading the time
// again each step. Timers are only as good as a few ms, so the last one is short.
export const fineSec = 0.1

export interface NextState {
  // Real seconds left of the song playing: its file time over the play
  // rate, plus how much later than usual its sound goes out (the join's skew)
  left: number
  // the next song is in the other element (loading or ready)
  loaded: boolean
  // the other element can start at once: it has data at the song's start
  ready: boolean
  // the song playing is playing, not paused
  playing: boolean
  // the other element is free: not still sounding out the song before
  free: boolean
  // seconds before the end to call play(), so it sounds a bit before the end
  lead: number
}

export type NextMove =
  | { kind: 'none' }
  | { kind: 'load' }
  | { kind: 'start' }
  // look again in this many ms
  | { kind: 'wait'; ms: number }

export function nextMove(s: NextState): NextMove {
  if (Number.isNaN(s.left)) return { kind: 'none' }
  if (!s.loaded) return s.free && s.left <= preloadSec ? { kind: 'load' } : { kind: 'none' }
  if (!s.playing || !s.ready) return { kind: 'none' }
  // past the end too: the join may hold the last song back that long
  const wait = s.left - s.lead
  if (wait <= 0.002) return { kind: 'start' }
  // far off: look again before the fine part; near: wait it out exactly
  const sec = wait > fineSec ? Math.min(wait - fineSec / 2, 1) : wait
  return { kind: 'wait', ms: sec * 1000 }
}

// The join (join.ts) holds the next song back by its overlap, so it is
// aimed to start this early: enough that it is rarely late, which would be a
// gap, and its song goes out only this much later than usual.
export const targetOverlap = 0.01
// the lead to start with, before any start was measured
export const firstLead = 0.015
// Without the join (its worklet failed to load) an overlap is heard, so it
// aims at no overlap: about what play() takes to sound.
export const plainLead = 0.005

// The lead to aim with next time, from how early (seconds; minus is late)
// the join found the last start: moved half way, so one odd start (a busy
// page) doesn't throw it far off. At most 0.1 s, well inside what it can hold.
export function learnLead(lead: number, early: number): number {
  return Math.min(0.1, Math.max(0, lead + (targetOverlap - early) / 2))
}
