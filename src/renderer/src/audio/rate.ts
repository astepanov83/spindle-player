// Which sample rate the audio graph runs at (ticket 091). A song at the
// graph's rate goes through it untouched and joins the next one to the
// sample; one at another rate is resampled in its element. So the graph
// follows the songs: a song at another rate gets a graph of its own.

// The graph before any song says its rate: CD rate, the most common.
export const firstRate = 44100
// what Chromium's AudioContext takes
export const minRate = 3000
export const maxRate = 768000

// The rate for a song: its own, or the graph's as it is when not known (a
// stream, an index not scanned again yet) or out of reach.
export function rateFor(song: number | undefined, graph: number): number {
  return song && Number.isInteger(song) && song >= minRate && song <= maxRate ? song : graph
}

// The analyser's FFT size: 4096 at 44.1 and 48 kHz, more at higher rates,
// so its bins stay as many per Hz and the visualizer looks the same.
export function fftSizeFor(rate: number): number {
  const n = 4096 * 2 ** Math.round(Math.log2(rate / firstRate))
  return Math.min(32768, Math.max(512, n))
}

// How long before the end to start the next song when it plays in a graph
// of its own: no join then, so it aims at no overlap. `play`: seconds from
// play() to its first sound in the graph. `from`, `to`: seconds each graph
// takes from its input to the speakers. Less than none: after the end.
export function crossLead(play: number, from: number, to: number): number {
  return Math.min(0.1, Math.max(-0.1, play + to - from))
}
