// The song's time for the lit line. The player says where the song is only
// about 4 times a second, so in between the time runs on from the last it
// said, while playing; never more than half a second, in case the sound stalls.
const most = 0.5

// pos: the last time the player said, at `at` ms (performance.now); now in ms.
export function songTime(pos: number, at: number, now: number, playing: boolean): number {
  if (!playing) return pos
  return pos + Math.min(most, Math.max(0, (now - at) / 1000))
}
