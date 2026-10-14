// The sleep timer (ticket 111, spec queue.md "Sleep timer"). A timed one
// fades the sound out over its last 20 s, pauses, and puts the volume back.
// End of song and End of album are the queue's to do (queue.svelte.ts asks
// stopsAfter). Not saved: a restart has no timer.
import type { SleepPick, SleepShown } from '../../../shared/sleep'
import { engine } from '../audio/engine'
import { fadeSec, setAt, shownOf, timedStep, type SleepSet } from '../queue/sleep'

// The volume comes back this long after the pause, once its sound has gone.
const quietSec = 0.5

class SleepTimer {
  set: SleepSet | undefined = $state.raw()
  // the clock the time left is shown by, a tick a second while timed
  now = $state(Date.now())
  shown: SleepShown | undefined = $derived(shownOf(this.set, this.now))

  // Pauses what plays; picks the song that follows again, so the one loaded
  // ahead for gapless is dropped or loaded. queues.svelte.ts sets both.
  pause: () => void = () => {}
  replan: () => void = () => {}

  #tick: ReturnType<typeof setInterval> | undefined
  #fading = false

  // A new choice starts over from now, also the same one again.
  pick(p: SleepPick): void {
    this.#drop()
    this.now = Date.now()
    this.set = setAt(p, this.now)
    if (typeof p === 'number') this.#tick = setInterval(() => this.#check(), 1000)
    this.replan()
  }

  cancel(): void {
    if (!this.set) return
    this.#drop()
    this.set = undefined
    this.replan()
  }

  // The queue stopped at the end of the song for it: the timer is used up.
  done(): void {
    this.cancel()
  }

  // A live item has no song end: End of song and End of album go with it.
  liveStarted(): void {
    if (this.set && !('end' in this.set)) this.cancel()
  }

  // Song shuffle has no album end to wait for (sleepPicksFor): End of album
  // goes. Shuffle by album keeps it.
  shuffleStarted(): void {
    if (this.set?.pick === 'album') this.cancel()
  }

  #drop(): void {
    clearInterval(this.#tick)
    this.#tick = undefined
    if (this.#fading) engine.unfade()
    this.#fading = false
  }

  #check(): void {
    const s = this.set
    if (!s || !('end' in s)) return
    this.now = Date.now()
    const step = timedStep(s.end, this.now)
    if (step === 'fade' && !this.#fading) {
      this.#fading = true
      engine.fadeOut(Math.min(fadeSec, (s.end - this.now) / 1000))
    } else if (step === 'end') {
      clearInterval(this.#tick)
      this.#tick = undefined
      this.#fading = false
      this.set = undefined
      this.pause()
      engine.unfade(quietSec)
    }
  }
}

export const sleep = new SleepTimer()
