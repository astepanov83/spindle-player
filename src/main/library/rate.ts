// Keeps each cover service under its request limit (ticket 014). Well below
// what each allows, so a big library never gets the app blocked.
export type Limiter = 'musicbrainz' | 'deezer' | 'itunes' | 'caa'

// ms between two requests. MusicBrainz allows 1 a second, iTunes about 20 a
// minute, Deezer 50 in 5s; Cover Art Archive images count on their own.
export const gaps: Record<Limiter, number> = {
  musicbrainz: 1100,
  deezer: 150,
  itunes: 3000,
  caa: 500
}

const firstBackOff = 60000
const maxBackOff = 3600000

export class RateLimit {
  #next = 0
  #backOff = 0

  constructor(
    readonly gapMs: number,
    readonly now = (): number => Date.now()
  ) {}

  // How long to wait before this request goes out. Its slot is taken now, so
  // two requests asking at once get different slots.
  take(): number {
    const t = this.now()
    const at = Math.max(t, this.#next)
    this.#next = at + this.gapMs
    return at - t
  }

  // The service said 429 or 503: nothing goes to it for a while.
  tooMany(): void {
    this.#backOff = this.#backOff ? Math.min(maxBackOff, this.#backOff * 2) : firstBackOff
    this.#next = Math.max(this.#next, this.now() + this.#backOff)
  }

  ok(): void {
    this.#backOff = 0
  }
}
