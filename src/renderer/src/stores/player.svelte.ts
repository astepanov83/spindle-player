// Slow player state: play/pause, and the position a few times a second.
// The visualizer loop (ticket 008) reads the analyser, not this.
import { engine } from '../audio/engine'

export const player = $state({
  playing: false,
  // seconds into the current song
  pos: 0,
  // the current song's length: the tag's until the file says otherwise
  duration: 0,
  shuffle: false,
  repeat: false
})

export function play(): void {
  if (!engine.loaded) return
  player.playing = true
  engine.play()
}

export function pause(): void {
  player.playing = false
  engine.pause()
}

export function togglePlay(): void {
  if (player.playing) pause()
  else play()
}

export function seek(pos: number): void {
  if (!engine.loaded) return
  player.pos = Math.max(0, Math.min(pos, player.duration || pos))
  engine.seek(player.pos)
}
