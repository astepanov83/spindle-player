// What shuffle mixes (ticket 125): off, songs, or albums (the albums in a
// random order, each album's songs in their order). For the player bar, the
// tray and Mini. Not saved, as shuffle is not.

export type ShuffleMode = 'off' | 'songs' | 'albums'

// what a press on Shuffle turns on
export type ShuffleBy = Exclude<ShuffleMode, 'off'>

export const shuffleModes: readonly ShuffleMode[] = ['off', 'songs', 'albums']

export function shuffleLabel(m: ShuffleMode): string {
  if (m === 'off') return 'Off'
  return m === 'songs' ? 'Songs' : 'Albums'
}

// The tray's and Mini's Shuffle submenu: "Shuffle: albums".
export function shuffleMenuLabel(m: ShuffleMode): string {
  return `Shuffle: ${shuffleLabel(m).toLowerCase()}`
}

// What the S key did, as the bar may be out of view.
export function shuffleNotice(m: ShuffleMode): string {
  return m === 'off' ? 'Shuffle off' : `Shuffle ${m}`
}

// What comes from the other side of IPC can't be trusted.
export function isShuffleMode(v: unknown): v is ShuffleMode {
  return shuffleModes.includes(v as ShuffleMode)
}
