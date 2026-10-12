// The sleep timer's choices (ticket 111), for the player bar's menu and the
// tray's. Not saved: a timer does not outlive a restart.

// The end of the song playing, the end of its album, or minutes from now.
export type SleepPick = 'song' | 'album' | 15 | 30 | 45 | 60 | 90

export const sleepPicks: readonly SleepPick[] = ['song', 'album', 15, 30, 45, 60, 90]

// A live item (radio) has no song or album end.
export const endsWithSong = (p: SleepPick): p is 'song' | 'album' => typeof p === 'string'

export function sleepLabel(p: SleepPick): string {
  if (p === 'song') return 'End of this song'
  if (p === 'album') return 'End of this album'
  return `${p} minutes`
}

// What comes from the other side of IPC can't be trusted.
export function isSleepPick(v: unknown): v is SleepPick {
  return sleepPicks.includes(v as SleepPick)
}

// The timer set, as the player bar shows it: `left` is "23m", "45s",
// "song" or "album".
export interface SleepShown {
  pick: SleepPick
  left: string
}
