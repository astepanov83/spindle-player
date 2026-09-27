// Slow player state. The visualizer loop (ticket 008) does not go through here.
export const player = $state({
  playing: false,
  // seconds into the current song
  pos: 0,
  // 0..100
  vol: 70,
  shuffle: false,
  repeat: false
})

export function togglePlay(): void {
  player.playing = !player.playing
}
