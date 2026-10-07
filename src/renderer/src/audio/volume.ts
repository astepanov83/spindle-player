// The slider is linear; ears are not. A square curve makes the low half of the slider useful.
export function gain(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100
  return v * v
}

// Mute keeps the volume, so unmuting goes back to it. Not saved: an app that
// starts silent looks broken.
export interface Sound {
  volume: number
  muted: boolean
}

// what the gain node gets
export const heard = (s: Sound): number => (s.muted ? 0 : s.volume)

// 0% sounds the same as muted, so it looks and acts the same
export const silent = (s: Sound): boolean => s.muted || s.volume === 0

export function volumeIcon(s: Sound): 'volMute' | 'volLow' | 'volHigh' {
  if (silent(s)) return 'volMute'
  return s.volume < 50 ? 'volLow' : 'volHigh'
}

// Below this a volume is too quiet to go back to from 0%.
export const minRestore = 10

// The Mute button and M. At 0% it brings back `restore`, the last volume the
// user left the slider at, since unmuting into silence would do nothing.
export function muteToggle(s: Sound, restore: number): Sound {
  if (!silent(s)) return { volume: s.volume, muted: true }
  return { volume: s.volume || restore, muted: false }
}

// Pixels a wheel must move for one step. A mouse wheel notch is 50-120 px
// and takes one step each; a touchpad sends small moves that add up.
const wheelNotch = 50
const lineHeight = 40

// One wheel event over the volume: +1 louder, -1 quieter, 0 not yet, and
// what is left over for the next small move.
export function wheelStep(
  rest: number,
  e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>
): { step: -1 | 0 | 1; rest: number } {
  const dy = e.deltaMode === 0 ? e.deltaY : e.deltaY * lineHeight * (e.deltaMode === 2 ? 20 : 1)
  if (dy === 0) return { step: 0, rest }
  // a move the other way drops what was left
  const sum = Math.sign(dy) === Math.sign(rest) ? rest + dy : dy
  if (Math.abs(dy) >= wheelNotch || Math.abs(sum) >= wheelNotch)
    return { step: dy < 0 ? 1 : -1, rest: 0 }
  return { step: 0, rest: sum }
}
