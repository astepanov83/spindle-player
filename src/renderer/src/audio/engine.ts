// The one <audio> element, fed through Web Audio so the visualizer can read it.
// Same setup as the prototype's "Play a song from your computer". The stores
// call this; it knows nothing about queues or tracks.
//
// Ticket 008 reads `engine.analyser` from its own requestAnimationFrame loop.
// Nothing per frame goes through the stores (decision 17).
//
// A song can be a part of its file (a CUE sheet's track in a disc image,
// ticket 012). Times in and out of the engine are then from the part's start,
// and `ended` comes at the part's end. The next part of the same file carries
// on without a reload (continueWith), so there is no gap between them.
//
// A radio stream is loaded with { live: true } (ticket 027): it has no length,
// and its errors go straight to the radio store, which reconnects.

export type EngineError = {
  // MediaError code: 2 network, 3 decode, 4 format not supported
  code: number
  message: string
  // Main answered 404: the file is gone or can't be read. Chromium gives
  // error 4 for that too, so this is asked for apart.
  gone: boolean
  // the error of the try before ?decode, if there was one
  first?: string
}

export interface EngineEvents {
  // about 4 times a second while playing, and after a seek
  time(pos: number): void
  // the song's length from the file, once known
  duration(seconds: number): void
  ended(): void
  // sound is coming out
  playing(): void
  // stopped by us, or by something else (media keys, the system's media controls)
  paused(): void
  seeked(): void
  // play() was refused (for example NotAllowedError); not the song's fault
  refused(message: string): void
  error(e: EngineError): void
  // no data to play for now; the radio store sees a stall by it
  waiting(): void
}

export interface LoadOptions {
  // a radio stream: no ?decode retry, no HEAD, no length
  live?: boolean
}

import { gain } from './volume'

// True when main has no readable file for a song URL (404), or doesn't answer
// within 5s (a NAS that dropped out). Any other answer counts as there: the
// error is then about the format.
export async function fileGone(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    return res.status === 404
  } catch (e) {
    return (e as Error)?.name === 'TimeoutError'
  }
}

// Where a song lies in its file, in seconds; no end: to the end of the file.
export interface Part {
  start: number
  end?: number
}

const wholeFile: Part = { start: 0 }
// how close to a part's end counts as there
const endSlack = 0.005

export class AudioEngine {
  readonly el: HTMLAudioElement
  readonly context: AudioContext
  readonly analyser: AnalyserNode
  // Volume is set here, after the analyser, so the visualizer sees the same
  // levels at any volume. The element itself stays at full volume.
  readonly #gain: GainNode
  #on: Partial<EngineEvents> = {}
  // where to go once the new file's length is known, in file time
  #startAt = 0
  // the file loaded, without ?decode
  #url = ''
  // main is decoding it with ffmpeg: Chromium could not play it as it is
  #decoding = false
  // why the try without ?decode failed
  #firstError = ''
  #part: Part = wholeFile
  // the part's end was reported; not again until it moves or changes
  #endSent = false
  #endTimer: ReturnType<typeof setTimeout> | undefined
  // play() was asked for last, not pause()
  #wantPlay = false
  #live = false

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

    el.addEventListener('timeupdate', () => {
      this.#on.time?.(this.#pos())
      this.#watchEnd()
    })
    el.addEventListener('durationchange', () => this.#sendDuration())
    el.addEventListener('loadedmetadata', () => {
      if (this.#startAt > 0) el.currentTime = Math.min(this.#startAt, el.duration || this.#startAt)
      this.#startAt = 0
    })
    el.addEventListener('ended', () => {
      if (!this.#endSent) this.#on.ended?.()
    })
    el.addEventListener('playing', () => {
      this.#on.playing?.()
      this.#watchEnd()
    })
    // at the end of a song 'pause' comes just before 'ended'; that one is not a pause
    el.addEventListener('pause', () => {
      clearTimeout(this.#endTimer)
      if (!el.ended) this.#on.paused?.()
    })
    el.addEventListener('seeked', () => {
      this.#on.seeked?.()
      this.#watchEnd()
    })
    el.addEventListener('waiting', () => this.#on.waiting?.())
    el.addEventListener('error', () => {
      // an error with no source is our own clear(), not a bad file
      if (!el.getAttribute('src')) return
      const e = el.error
      // a stream can't be decoded by ffmpeg or asked with a HEAD: the radio store decides
      if (this.#live) {
        this.#on.error?.({ code: e?.code ?? 0, message: e?.message ?? '', gone: false })
        return
      }
      // Chromium can't read it (3 decode, 4 format): once more, decoded by ffmpeg
      if ((e?.code === 3 || e?.code === 4) && !this.#decoding && this.#url) {
        this.#decoding = true
        this.#firstError = `error ${e.code} ${e.message}`
        this.#startAt = this.#startAt || el.currentTime
        el.src = `${this.#url}?decode`
        if (this.#wantPlay) this.#playElement()
        return
      }
      const url = this.#url
      const code = e?.code ?? 0
      const message = e?.message ?? ''
      const first = this.#decoding ? this.#firstError : undefined
      // A network error (2) is the file not coming through, never its format.
      // Only a decode or format error needs asking whether the file is there.
      const check = code === 3 || code === 4 ? fileGone(url) : Promise.resolve(true)
      void check.then((gone) => {
        // a newer song came first
        if (url === this.#url) this.#on.error?.({ code, message, gone, first })
      })
    })
  }

  // seconds into the part
  #pos(): number {
    return Math.max(0, this.el.currentTime - this.#part.start)
  }

  #sendDuration(): void {
    // a stream's length is Infinity
    if (this.#live) return
    const { start, end } = this.#part
    if (end !== undefined) this.#on.duration?.(end - start)
    else if (Number.isFinite(this.el.duration)) this.#on.duration?.(this.el.duration - start)
  }

  // A part that ends before its file does: 'timeupdate' comes only 4 times a
  // second, so a timer stops it on time.
  #watchEnd(): void {
    clearTimeout(this.#endTimer)
    const end = this.#part.end
    if (end === undefined || this.#endSent || this.el.paused) return
    const left = end - this.el.currentTime
    if (left <= endSlack) {
      this.#endSent = true
      this.#on.ended?.()
      return
    }
    const ms = (left * 1000) / (this.el.playbackRate || 1)
    this.#endTimer = setTimeout(() => this.#watchEnd(), Math.min(ms, 1000))
  }

  on(events: Partial<EngineEvents>): void {
    this.#on = { ...this.#on, ...events }
  }

  get loaded(): boolean {
    return !!this.el.getAttribute('src')
  }

  // Starts loading a song, `at` seconds into it (into `part`, if it is a part
  // of the file). Call play() to hear it. Another part of the file already
  // loaded is only a seek. A live stream always opens a new connection.
  load(url: string, at = 0, part: Part = wholeFile, opts: LoadOptions = {}): void {
    const live = !!opts.live
    const same = !live && !this.#live && url === this.#url && this.loaded && !this.el.error
    this.#live = live
    this.#part = part
    this.#endSent = false
    if (same) {
      this.#sendDuration()
      this.seek(at)
      this.#on.time?.(at)
      return
    }
    this.#url = url
    this.#decoding = false
    this.#startAt = part.start + at
    this.el.src = url
  }

  // The song after the one playing is the next part of the same file: the
  // sound goes on as it is, and times are from the new part from now on.
  continueWith(part: Part): void {
    this.#part = part
    this.#endSent = false
    this.#sendDuration()
    this.#on.time?.(this.#pos())
    this.#watchEnd()
  }

  play(): void {
    if (!this.loaded) return
    this.#wantPlay = true
    // like an ended file, a part played to its end starts again
    const end = this.#part.end
    if (end !== undefined && this.el.currentTime >= end - endSlack) this.seek(0)
    this.#playElement()
  }

  #playElement(): void {
    void this.context.resume()
    this.el.play().catch((e: DOMException) => {
      // AbortError: a newer load() came first. NotSupportedError: the error event handles it.
      if (e.name !== 'AbortError' && e.name !== 'NotSupportedError')
        this.#on.refused?.(`${e.name}: ${e.message}`)
    })
  }

  pause(): void {
    this.#wantPlay = false
    this.el.pause()
  }

  // `pos` seconds into the song
  seek(pos: number): void {
    if (!this.loaded) return
    this.#endSent = false
    const at = this.#part.start + pos
    // before the length is known, remember it for loadedmetadata
    if (this.el.readyState < HTMLMediaElement.HAVE_METADATA) this.#startAt = at
    else this.el.currentTime = at
  }

  setVolume(volume: number): void {
    this.#gain.gain.value = gain(volume)
  }

  // Nothing to play: drop the file so it stops loading.
  clear(): void {
    this.#wantPlay = false
    this.#url = ''
    this.#live = false
    this.#part = wholeFile
    clearTimeout(this.#endTimer)
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
  }
}

export const engine = new AudioEngine()
