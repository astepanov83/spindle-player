// Two <audio> elements, fed through Web Audio so the visualizer can read them.
// Same setup as the prototype's "Play a song from your computer". The stores
// call this; it knows nothing about queues or tracks.
//
// One element plays. The other loads the song that comes next (setNext) near
// the end, and starts it a little before this one ends. Then they swap. Only
// the playing one's events go out. Both go through the join (join.ts), which
// holds the next song's sound back until the last one has run out, so there
// is no gap and no overlap between files (ticket 087).
//
// Ticket 008 reads `engine.analyser` from its own requestAnimationFrame loop.
// Nothing per frame goes through the stores (decision 17).
//
// A song can be a part of its file (a CUE sheet's track in a disc image,
// ticket 012). Times in and out of the engine are then from the part's start,
// and `ended` comes at the part's end. The next part of the same file carries
// on without a reload (continueWith), so there is no gap between them.
//
// A live stream (radio) is loaded with { live: true } (ticket 027): it has no length,
// and its errors go straight to its live plugin, which reconnects (ticket 057).
//
// Each song comes with its own level (ReplayGain, ticket 090), set on its
// element's gain node. That is before the analyser, so the visualizer sees
// the evened level, and apart from the volume, which comes after.

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
  // no data to play for now; a live plugin sees a stall by it
  waiting(): void
  // the song given to setNext took over as this one ended; times and the
  // length are its own from now on
  nextStarted(): void
}

export interface LoadOptions {
  // a radio stream: no ?decode retry, no HEAD, no length
  live?: boolean
  // the song's level as a factor (replaygain.ts); 1 when left out
  gain?: number
}

import { firstLead, learnLead, nextMove, plainLead } from './gapless'
import type { JoinIn, JoinOut } from './join'
import joinUrl from './join-worklet?worker&url'
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

// A song to load ahead and play next.
export interface Next {
  url: string
  part?: Part
  // as in LoadOptions
  gain?: number
}

const wholeFile: Part = { start: 0 }
// how close to a part's end counts as there
const endSlack = 0.005
// A change of level on a song that plays glides this fast (a time constant,
// in seconds), so it makes no click.
const glide = 0.02

// One <audio> element with its own gain, into the graph both share.
class Deck {
  readonly el: HTMLAudioElement
  // This song's own gain, before the analyser: its ReplayGain level (ticket
  // 090). It also cuts a part of a file off where it ends, once the next
  // song took over and the file would go on.
  readonly gain: GainNode
  // the file loaded, without ?decode
  url = ''
  // main is decoding it with ffmpeg: Chromium could not play it as it is
  decoding = false
  // why the try without ?decode failed
  firstError = ''
  // where to go once the length is known, in file time
  startAt = 0
  live = false
  // The song's ReplayGain level, as a factor. Kept here, not only in the
  // node, so a new graph can set it again on its own nodes.
  level = 1

  // tells the join this element has a new song, or none
  readonly #reset: () => void

  constructor(context: AudioContext, out: AudioNode, reset: () => void) {
    this.#reset = reset
    const el = new Audio()
    // Without this the analyser only gets silence: spindle:// answers with CORS headers.
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    this.el = el
    this.gain = context.createGain()
    context.createMediaElementSource(el).connect(this.gain).connect(out)
  }

  get loaded(): boolean {
    return !!this.el.getAttribute('src')
  }

  // `at` is in file time
  load(url: string, at: number, live: boolean, gain: number): void {
    this.url = url
    this.decoding = false
    this.firstError = ''
    this.startAt = at
    this.live = live
    this.setGain(gain)
    this.el.src = url
    this.#reset()
  }

  // At once, for a song not heard yet.
  setGain(gain: number): void {
    this.level = gain
    this.gain.gain.cancelScheduledValues(0)
    this.gain.gain.value = gain
  }

  // From now on, gliding there, for a song that plays.
  glideGain(gain: number, now: number): void {
    this.level = gain
    const p = this.gain.gain
    p.cancelScheduledValues(now)
    p.setTargetAtTime(gain, now, glide)
  }

  // `at` is in file time; before the length is known, it waits for loadedmetadata
  seek(at: number): void {
    if (this.el.readyState < HTMLMediaElement.HAVE_METADATA) this.startAt = at
    else this.el.currentTime = at
  }

  // Drops the file so it stops loading.
  clear(): void {
    this.url = ''
    this.live = false
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    this.#reset()
  }
}

export class AudioEngine {
  readonly context: AudioContext
  readonly analyser: AnalyserNode
  // Volume is set here, after the analyser, so the visualizer sees the same
  // levels at any volume. The elements themselves stay at full volume.
  readonly #volume: GainNode
  readonly #decks: [Deck, Deck]
  // the join, once its worklet loaded; until then (or if it fails) the
  // elements go to the analyser as they are
  #join: AudioWorkletNode | undefined
  // the one that plays, or is loaded to play
  #deck: Deck
  #on: Partial<EngineEvents> = {}
  #part: Part = wholeFile
  // the part's end was reported; not again until it moves or changes
  #endSent = false
  #endTimer: ReturnType<typeof setTimeout> | undefined
  // play() was asked for last, not pause()
  #wantPlay = false
  // the song to play after this one (setNext)
  #next: (Part & { url: string; gain: number }) | undefined
  // the other element has it, loading or ready
  #nextLoaded = false
  // it could not load there: it loads the usual way when its turn comes,
  // and fails then as any song does
  #nextFailed = false
  #nextTimer: ReturnType<typeof setTimeout> | undefined
  // the other element still sounds out the song before, until the timer
  #finishing: { deck: Deck; timer: ReturnType<typeof setTimeout> } | undefined
  // How long before the end the next song is told to play, learned from the
  // overlap the join measures at each start.
  #lead = firstLead
  // seconds the playing song's sound goes out later than usual: the join
  // held it back by its overlap
  #skew = 0

  constructor() {
    // 44.1 kHz, the rate of most music (CDs). A song at the graph's rate
    // joins the next one to the sample (join.ts); one at another rate is
    // resampled on its own, which leaves a faint trace high up at a join.
    // Chromium takes the graph's sound to the device's rate in one go.
    this.context = new AudioContext({ sampleRate: 44100 })
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = 0.5
    this.#volume = this.context.createGain()
    this.analyser.connect(this.#volume).connect(this.context.destination)
    const deck = (i: number): Deck =>
      new Deck(this.context, this.analyser, () => this.#tell({ reset: i }))
    this.#decks = [deck(0), deck(1)]
    this.#deck = this.#decks[0]
    for (const d of this.#decks) this.#listen(d)
    void this.#loadJoin()

    // A context made before any click may start suspended; the first gesture wakes it.
    const wake = (): void => {
      void this.context.resume()
      removeEventListener('pointerdown', wake, true)
      removeEventListener('keydown', wake, true)
    }
    addEventListener('pointerdown', wake, true)
    addEventListener('keydown', wake, true)
  }

  async #loadJoin(): Promise<void> {
    try {
      await this.context.audioWorklet.addModule(joinUrl)
    } catch (e) {
      console.error('The gapless join did not load; songs still play, each start a few ms off', e)
      return
    }
    const join = new AudioWorkletNode(this.context, 'spindle-join', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      // mono and 5.1 come in as two channels, as the speakers would get them
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers'
    })
    join.port.onmessage = (e: MessageEvent<JoinOut>) => this.#joined(e.data)
    this.#decks.forEach((d, i) => {
      d.gain.disconnect()
      d.gain.connect(join, 0, i)
    })
    join.connect(this.analyser)
    this.#join = join
  }

  #tell(m: JoinIn): void {
    this.#join?.port.postMessage(m)
  }

  // The join let the next song through, held back by its skew: that counts
  // toward the end of its song. How early its sound came aims the next start.
  #joined(m: JoinOut): void {
    if (this.#decks[m.joined] !== this.#deck) return
    const rate = this.context.sampleRate
    this.#skew = m.skew / rate
    if (m.early !== null) this.#lead = learnLead(this.#lead, m.early / rate)
    this.#plan()
  }

  // The element that plays now: it changes at each start of a next song.
  get el(): HTMLAudioElement {
    return this.#deck.el
  }

  get #other(): Deck {
    return this.#decks[this.#decks[0] === this.#deck ? 1 : 0]
  }

  #listen(d: Deck): void {
    const el = d.el
    const plays = (): boolean => d === this.#deck
    el.addEventListener('timeupdate', () => {
      if (!plays()) return
      this.#on.time?.(this.#pos())
      this.#watchEnd()
      this.#plan()
    })
    el.addEventListener('durationchange', () => {
      if (!plays()) return
      this.#sendDuration()
      this.#plan()
    })
    el.addEventListener('loadedmetadata', () => {
      if (d.startAt > 0) el.currentTime = Math.min(d.startAt, el.duration || d.startAt)
      d.startAt = 0
    })
    // the next song may be ready to start now
    el.addEventListener('canplay', () => {
      if (!plays()) this.#plan()
    })
    el.addEventListener('ended', () => {
      if (!plays() || this.#endSent) return
      // the join holds the last song back: its sound goes on a bit yet
      if (this.#nextReady() && this.#wantPlay) this.#startNext(0)
      else this.#on.ended?.()
    })
    el.addEventListener('playing', () => {
      if (!plays()) return
      this.#on.playing?.()
      this.#watchEnd()
      this.#plan()
    })
    // at the end of a song 'pause' comes just before 'ended'; that one is not a pause
    el.addEventListener('pause', () => {
      if (!plays()) return
      clearTimeout(this.#endTimer)
      clearTimeout(this.#nextTimer)
      if (!el.ended) this.#on.paused?.()
    })
    el.addEventListener('seeked', () => {
      if (!plays()) return this.#plan()
      this.#on.seeked?.()
      this.#watchEnd()
      this.#plan()
    })
    el.addEventListener('waiting', () => {
      if (plays()) this.#on.waiting?.()
    })
    el.addEventListener('error', () => this.#failed(d))
  }

  #failed(d: Deck): void {
    const el = d.el
    // an error with no source is our own clear(), not a bad file
    if (!el.getAttribute('src') || this.#finishing?.deck === d) return
    const e = el.error
    const plays = d === this.#deck
    // a stream can't be decoded by ffmpeg or asked with a HEAD: its live plugin decides
    if (d.live) {
      if (plays) this.#on.error?.({ code: e?.code ?? 0, message: e?.message ?? '', gone: false })
      return
    }
    // Chromium can't read it (3 decode, 4 format): once more, decoded by ffmpeg
    if ((e?.code === 3 || e?.code === 4) && !d.decoding && d.url) {
      d.decoding = true
      d.firstError = `error ${e.code} ${e.message}`
      d.startAt = d.startAt || el.currentTime
      el.src = `${d.url}?decode`
      if (plays && this.#wantPlay) this.#playElement()
      return
    }
    if (!plays) {
      this.#nextFailed = true
      this.#nextLoaded = false
      d.clear()
      return
    }
    const url = d.url
    const code = e?.code ?? 0
    const message = e?.message ?? ''
    const first = d.decoding ? d.firstError : undefined
    // A network error (2) is the file not coming through, never its format.
    // Only a decode or format error needs asking whether the file is there.
    const check = code === 3 || code === 4 ? fileGone(url) : Promise.resolve(true)
    void check.then((gone) => {
      // a newer song came first
      if (d === this.#deck && url === d.url) this.#on.error?.({ code, message, gone, first })
    })
  }

  // seconds into the part
  #pos(): number {
    return Math.max(0, this.el.currentTime - this.#part.start)
  }

  #sendDuration(): void {
    // a stream's length is Infinity
    if (this.#deck.live) return
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
      // the join holds the last song back: its sound goes on a bit yet
      if (this.#nextReady() && this.#wantPlay) return this.#startNext(left)
      this.#endSent = true
      this.#on.ended?.()
      return
    }
    const ms = (left * 1000) / (this.el.playbackRate || 1)
    this.#endTimer = setTimeout(() => this.#watchEnd(), Math.min(ms, 1000))
  }

  // Loads the next song into the other element near the end, and starts it
  // on time (gapless.ts says when).
  #plan(): void {
    clearTimeout(this.#nextTimer)
    const d = this.#deck
    const next = this.#next
    if (!next || this.#nextFailed || d.live || !d.loaded || d.el.error) return
    const left = ((this.#part.end ?? d.el.duration) - d.el.currentTime) / (d.el.playbackRate || 1)
    const move = nextMove({
      left: left + this.#skew,
      loaded: this.#nextLoaded,
      ready: this.#nextReady(),
      playing: this.#wantPlay && !d.el.paused && !this.#endSent,
      free: !this.#finishing,
      lead: this.#join ? this.#lead : plainLead
    })
    if (move.kind === 'load') {
      this.#other.load(next.url, next.start, false, next.gain)
      this.#nextLoaded = true
    } else if (move.kind === 'start') this.#startNext(left)
    else if (move.kind === 'wait') this.#nextTimer = setTimeout(() => this.#plan(), move.ms)
  }

  // the next song is loaded in the other element and can start at once
  #nextReady(): boolean {
    const o = this.#other.el
    return this.#nextLoaded && o.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !o.seeking
  }

  // The next song starts now, `left` seconds before this one's file ends.
  #startNext(left: number): void {
    const from = this.#deck
    const next = this.#next!
    const cut = this.#part.end !== undefined
    const sounding = Math.max(0, left) + this.#skew
    clearTimeout(this.#endTimer)
    this.#deck = this.#other
    this.#part =
      next.end === undefined ? { start: next.start } : { start: next.start, end: next.end }
    this.#endSent = false
    this.#next = undefined
    this.#nextLoaded = false
    this.#skew = 0
    this.#tell({ arm: { from: this.#decks.indexOf(from), to: this.#decks.indexOf(this.#deck) } })
    this.#playElement()
    this.#finish(from, Math.max(0, left), cut, sounding)
    this.#on.nextStarted?.()
    this.#sendDuration()
    this.#on.time?.(this.#pos())
    this.#watchEnd()
  }

  // The song before sounds out its last `left` seconds in the other element,
  // and is heard `sounding` seconds more. A part of a file is cut where it
  // ends, since the file goes on. Then the element is free for the song after.
  #finish(d: Deck, left: number, cut: boolean, sounding: number): void {
    if (cut) d.gain.gain.setValueAtTime(0, this.context.currentTime + left)
    const timer = setTimeout(() => this.#free(), sounding * 1000 + 200)
    this.#finishing = { deck: d, timer }
  }

  #free(): void {
    const f = this.#finishing
    if (!f) return
    clearTimeout(f.timer)
    this.#finishing = undefined
    f.deck.clear()
    this.#plan()
  }

  on(events: Partial<EngineEvents>): void {
    this.#on = { ...this.#on, ...events }
  }

  get loaded(): boolean {
    return this.#deck.loaded
  }

  // Starts loading a song, `at` seconds into it (into `part`, if it is a part
  // of the file). Call play() to hear it. Another part of the file already
  // loaded is only a seek, and so is the next song already loaded in the
  // other element (it takes over). A live stream always opens a new connection.
  load(url: string, at = 0, part: Part = wholeFile, opts: LoadOptions = {}): void {
    const live = !!opts.live
    const gain = opts.gain ?? 1
    const d = this.#deck
    const o = this.#other
    const same = !live && !d.live && url === d.url && d.loaded && !d.el.error
    const ahead = !live && this.#nextLoaded && url === o.url && !o.el.error
    this.#part = part
    this.#endSent = false
    if (!same) this.#skew = 0
    if (same || ahead) {
      if (ahead) {
        this.#deck = o
        this.#next = undefined
        this.#nextLoaded = false
        d.clear()
        o.setGain(gain)
      } else this.#deck.glideGain(gain, this.context.currentTime)
      this.#sendDuration()
      this.seek(at)
      this.#on.time?.(at)
      return
    }
    // a stream has no end to start a next song at
    if (live) this.setNext()
    d.load(url, part.start + at, live, gain)
  }

  // The song after the one playing is the next part of the same file: the
  // sound goes on as it is, and times are from the new part from now on.
  // `gain` is the new part's level.
  continueWith(part: Part, gain = 1): void {
    this.#deck.glideGain(gain, this.context.currentTime)
    this.#part = part
    this.#endSent = false
    this.#sendDuration()
    this.#on.time?.(this.#pos())
    this.#watchEnd()
    this.#plan()
  }

  // The song to play right after this one, or none. It loads in the other
  // element near the end and starts as this one ends, then `nextStarted`
  // comes instead of `ended`. Not for a part that follows this one in the
  // same file: continueWith carries on there.
  setNext(next?: Next): void {
    const n = next && { url: next.url, ...(next.part ?? wholeFile), gain: next.gain ?? 1 }
    const was = this.#next
    const o = this.#other
    if (n && was && n.url === was.url && n.start === was.start && n.end === was.end) {
      // the same song at another level: not heard yet, so set at once
      if (n.gain !== was.gain && this.#nextLoaded) o.setGain(n.gain)
      this.#next = n
      return
    }
    this.#next = n
    this.#nextFailed = false
    if (this.#nextLoaded) {
      // the same file: only another place in it
      if (n && n.url === o.url && !o.el.error) {
        o.seek(n.start)
        o.setGain(n.gain)
      } else {
        o.clear()
        this.#nextLoaded = false
      }
    }
    this.#plan()
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
    clearTimeout(this.#nextTimer)
    this.el.pause()
  }

  // `pos` seconds into the song
  seek(pos: number): void {
    if (!this.loaded) return
    this.#endSent = false
    clearTimeout(this.#nextTimer)
    this.#deck.seek(this.#part.start + pos)
  }

  setVolume(volume: number): void {
    this.#volume.gain.value = gain(volume)
  }

  // A new level for the song playing (the setting changed): it glides there.
  setGain(gain: number): void {
    if (this.loaded) this.#deck.glideGain(gain, this.context.currentTime)
  }

  // Nothing to play: drop both files so they stop loading.
  clear(): void {
    this.#wantPlay = false
    this.#part = wholeFile
    this.#next = undefined
    this.#nextLoaded = false
    this.#nextFailed = false
    this.#skew = 0
    clearTimeout(this.#endTimer)
    clearTimeout(this.#nextTimer)
    clearTimeout(this.#finishing?.timer)
    this.#finishing = undefined
    for (const d of this.#decks) d.clear()
  }
}

export const engine = new AudioEngine()
