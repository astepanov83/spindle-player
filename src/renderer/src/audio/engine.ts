// The one <audio> element, fed through Web Audio so the visualizer can read it.
// Same setup as the prototype's "Play a song from your computer". The stores
// call this; it knows nothing about queues or tracks.
//
// Ticket 008 reads `engine.analyser` from its own requestAnimationFrame loop.
// Nothing per frame goes through the stores (decision 17).

export type EngineError = {
  // MediaError code: 2 network, 3 decode, 4 format not supported
  code: number
  message: string
}

export interface EngineEvents {
  // about 4 times a second while playing, and after a seek
  time(pos: number): void
  // the file's own length, once known
  duration(seconds: number): void
  ended(): void
  // sound is coming out
  playing(): void
  paused(): void
  seeked(): void
  error(e: EngineError): void
}

import { gain } from './volume'

// Song URLs: main serves indexed files by id (src/main/library/protocol.ts).
export function mediaUrl(trackId: string): string {
  return `spindle://media/${trackId}`
}

class AudioEngine {
  readonly el: HTMLAudioElement
  readonly context: AudioContext
  readonly analyser: AnalyserNode
  // Volume is set here, after the analyser, so the visualizer sees the same
  // levels at any volume. The element itself stays at full volume.
  readonly #gain: GainNode
  #on: Partial<EngineEvents> = {}
  // where to go once the new file's length is known
  #startAt = 0

  constructor() {
    const el = new Audio()
    // Without this the analyser only gets silence: spindle:// answers with CORS headers.
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    this.el = el

    this.context = new AudioContext()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = 0.5
    this.#gain = this.context.createGain()
    this.context
      .createMediaElementSource(el)
      .connect(this.analyser)
      .connect(this.#gain)
      .connect(this.context.destination)

    // A context made before any click may start suspended; the first gesture wakes it.
    const wake = (): void => {
      void this.context.resume()
      removeEventListener('pointerdown', wake, true)
      removeEventListener('keydown', wake, true)
    }
    addEventListener('pointerdown', wake, true)
    addEventListener('keydown', wake, true)

    el.addEventListener('timeupdate', () => this.#on.time?.(el.currentTime))
    el.addEventListener('durationchange', () => {
      if (Number.isFinite(el.duration)) this.#on.duration?.(el.duration)
    })
    el.addEventListener('loadedmetadata', () => {
      if (this.#startAt > 0) el.currentTime = Math.min(this.#startAt, el.duration || this.#startAt)
      this.#startAt = 0
    })
    el.addEventListener('ended', () => this.#on.ended?.())
    el.addEventListener('playing', () => this.#on.playing?.())
    el.addEventListener('pause', () => this.#on.paused?.())
    el.addEventListener('seeked', () => this.#on.seeked?.())
    el.addEventListener('error', () => {
      // an error with no source is our own clear(), not a bad file
      if (!el.getAttribute('src')) return
      const e = el.error
      this.#on.error?.({ code: e?.code ?? 0, message: e?.message ?? '' })
    })
  }

  on(events: Partial<EngineEvents>): void {
    this.#on = { ...this.#on, ...events }
  }

  get loaded(): boolean {
    return !!this.el.getAttribute('src')
  }

  // Starts loading a song; `at` seconds in. Call play() to hear it.
  load(url: string, at = 0): void {
    this.#startAt = at
    this.el.src = url
  }

  play(): void {
    if (!this.loaded) return
    void this.context.resume()
    this.el.play().catch((e: DOMException) => {
      // AbortError: a newer load() came first. NotSupportedError: the error event handles it.
      if (e.name !== 'AbortError' && e.name !== 'NotSupportedError')
        this.#on.error?.({ code: 0, message: `${e.name}: ${e.message}` })
    })
  }

  pause(): void {
    this.el.pause()
  }

  seek(pos: number): void {
    if (!this.loaded) return
    // before the length is known, remember it for loadedmetadata
    if (this.el.readyState < HTMLMediaElement.HAVE_METADATA) this.#startAt = pos
    else this.el.currentTime = pos
  }

  setVolume(volume: number): void {
    this.#gain.gain.value = gain(volume)
  }

  // Nothing to play: drop the file so it stops loading.
  clear(): void {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
  }
}

export const engine = new AudioEngine()
