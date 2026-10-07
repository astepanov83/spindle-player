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
//
// The elements, the join and the analyser make a graph (graph.ts) that runs
// at the playing song's sample rate (ticket 091), so nothing is resampled
// before the join. A next song at another rate loads in a new graph at its
// rate, and starts there as plainly as a timer can (no join across two
// graphs). The old graph closes once its song has sounded out.

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
  // the song's sample rate in Hz, when known: the graph runs at it
  rate?: number
}

import { firstLead, learnLead, nextMove, plainLead, targetOverlap } from './gapless'
import { Graph, type Deck } from './graph'
import type { JoinOut } from './join'
import { crossLead, firstRate, rateFor } from './rate'
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
  rate?: number
}

const wholeFile: Part = { start: 0 }
// see #leadFor
const unseenMargin = 0.01
// how close to a part's end counts as there
const endSlack = 0.005

export class AudioEngine {
  // the graph the song playing is in
  #graph: Graph
  // A graph made for the next song, at its rate, when that is not this
  // graph's; its first element has the next song while #nextLoaded.
  #ahead: Graph | undefined
  // the volume's gain factor, for every graph
  #volume = 1
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
  #next: (Part & { url: string; gain: number; rate?: number }) | undefined
  // the other element has it, loading or ready
  #nextLoaded = false
  // it could not load there: it loads the usual way when its turn comes,
  // and fails then as any song does
  #nextFailed = false
  #nextTimer: ReturnType<typeof setTimeout> | undefined
  // a start of the next song held past the end (#atEnd)
  #late: ReturnType<typeof setTimeout> | undefined
  // An element still sounds out the song before, until the timer: the other
  // one of this graph, or one of the graph before.
  #finishing: { deck: Deck; timer: ReturnType<typeof setTimeout> } | undefined
  // How long before the end the next song is told to play, learned from the
  // overlap the join measures at each start. By the graph's rate, since how
  // long an element takes to start differs by rate (longer at 96 kHz in the
  // app check); see #leadFor for a rate not seen yet.
  #leads = new Map<number, number>()
  #lead = firstLead
  // seconds the playing song's sound goes out later than usual: the join
  // held it back by its overlap
  #skew = 0

  constructor() {
    this.#graph = this.#build(firstRate, false)!
    this.#deck = this.#graph.decks[0]

    // A context made before any click may start suspended; the first gesture wakes it.
    const wake = (): void => {
      void this.context.resume()
      removeEventListener('pointerdown', wake, true)
      removeEventListener('keydown', wake, true)
    }
    addEventListener('pointerdown', wake, true)
    addEventListener('keydown', wake, true)
  }

  // The graph the song playing is in. Ticket 008 reads the analyser from its
  // own requestAnimationFrame loop; both change when a song at another rate
  // starts.
  get context(): AudioContext {
    return this.#graph.context
  }

  get analyser(): AnalyserNode {
    return this.#graph.analyser
  }

  // A new graph at `rate`, its elements listened to; none if the context
  // can't be made (the first one must be).
  #build(rate: number, waits: boolean): Graph | undefined {
    let g: Graph
    try {
      g = new Graph(rate, { volume: this.#volume, waits, joined: (g, m) => this.#joined(g, m) })
    } catch (e) {
      if (!waits) throw e
      console.error(`No audio graph at ${rate} Hz; the song plays in the one there is`, e)
      return undefined
    }
    for (const d of g.decks) this.#listen(d)
    return g
  }

  // Closes a graph that is no longer needed, and forgets its song sounding out.
  #close(g: Graph): void {
    if (this.#finishing?.deck.graph === g) {
      clearTimeout(this.#finishing.timer)
      this.#finishing = undefined
    }
    g.close()
  }

  // The join let the next song through, held back by its skew: that counts
  // toward the end of its song. How early its sound came aims the next start.
  #joined(g: Graph, m: JoinOut): void {
    if (g !== this.#graph || g.decks[m.joined] !== this.#deck) return
    this.#skew = m.skew / g.rate
    if (m.early !== null) {
      this.#lead = learnLead(this.#leadFor(g.rate), m.early / g.rate)
      this.#leads.set(g.rate, this.#lead)
    }
    this.#plan()
  }

  // The element that plays now: it changes at each start of a next song.
  get el(): HTMLAudioElement {
    return this.#deck.el
  }

  // where the next song loads: the other element, or the first one of a
  // graph at its rate
  get #other(): Deck {
    return this.#ahead?.decks[0] ?? this.#graph.other(this.#deck)
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
      if (this.#nextReady() && this.#wantPlay) this.#atEnd(0)
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
      this.#dropNext()
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
      if (this.#nextReady() && this.#wantPlay) return this.#atEnd(left)
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
      lead: this.#leadNow()
    })
    if (move.kind === 'load') {
      const g = this.#graph
      const rate = rateFor(next.rate, g.rate)
      if (rate !== g.rate) this.#ahead = this.#build(rate, true)
      this.#other.load(next.url, next.start, false, next.gain)
      this.#nextLoaded = true
    } else if (move.kind === 'start') this.#startNext(left)
    else if (move.kind === 'wait') this.#nextTimer = setTimeout(() => this.#plan(), move.ms)
  }

  // How long before the end the next song is told to play. In this graph
  // the join holds it back, so it aims a bit early; in a graph of its own it
  // aims at the end, with what play() takes (learned from the joins) and
  // the two graphs' delays.
  #leadNow(): number {
    const g = this.#graph
    const a = this.#ahead
    if (a && this.#nextLoaded) {
      const play = (this.#leads.get(a.rate) ?? this.#lead) - targetOverlap
      return crossLead(Math.max(0, play), g.delay, a.delay)
    }
    return g.join ? this.#leadFor(g.rate) : plainLead
  }

  // A rate with no join yet aims 10 ms earlier than the last learned: an
  // element may take longer to start there, and an early start is only held.
  #leadFor(rate: number): number {
    return this.#leads.get(rate) ?? Math.min(0.1, this.#lead + unseenMargin)
  }

  // the next song is loaded in the other element and can start at once
  #nextReady(): boolean {
    const o = this.#other
    return (
      this.#nextLoaded &&
      o.graph.ready &&
      o.el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
      !o.el.seeking
    )
  }

  // The song playing is at its end, or `left` seconds before it (a part of a
  // file). The next song starts now, or a bit later when it plays in a graph
  // of its own that takes less time to the speakers than this one.
  #atEnd(left: number): void {
    const late = left - this.#leadNow()
    if (late <= 0.002) return this.#startNext(left)
    if (this.#late !== undefined) return
    const d = this.#deck
    // a part's file goes on: it stops at the part's end all the same
    if (this.#part.end !== undefined)
      d.gain.gain.setValueAtTime(0, d.graph.context.currentTime + Math.max(0, left))
    this.#late = setTimeout(() => {
      this.#late = undefined
      if (this.#deck === d && this.#nextReady() && this.#wantPlay) this.#startNext(left - late)
      else d.setGain(d.level)
    }, late * 1000)
  }

  #stopLate(): void {
    clearTimeout(this.#late)
    this.#late = undefined
  }

  // The next song starts now, `left` seconds before this one's file ends.
  #startNext(left: number): void {
    const from = this.#deck
    const to = this.#other
    const next = this.#next!
    const cut = this.#part.end !== undefined
    const sounding = Math.max(0, left) + this.#skew
    clearTimeout(this.#endTimer)
    this.#deck = to
    if (this.#ahead) {
      // in a graph of its own, played plainly
      this.#graph = this.#ahead
      this.#ahead = undefined
    } else this.#graph.tell({ arm: { from: from.i, to: to.i } })
    this.#part =
      next.end === undefined ? { start: next.start } : { start: next.start, end: next.end }
    this.#endSent = false
    this.#next = undefined
    this.#nextLoaded = false
    this.#skew = 0
    this.#playElement()
    this.#finish(from, Math.max(0, left), cut, sounding)
    this.#on.nextStarted?.()
    this.#sendDuration()
    this.#on.time?.(this.#pos())
    this.#watchEnd()
  }

  // The song before sounds out its last `left` seconds in its element, and
  // is heard `sounding` seconds more. A part of a file is cut where it
  // ends, since the file goes on. Then the element is free for the song
  // after, or its graph closes if it was another.
  #finish(d: Deck, left: number, cut: boolean, sounding: number): void {
    if (cut) d.gain.gain.setValueAtTime(0, d.graph.context.currentTime + left)
    const timer = setTimeout(() => this.#free(), sounding * 1000 + 200)
    this.#finishing = { deck: d, timer }
  }

  #free(): void {
    const f = this.#finishing
    if (!f) return
    clearTimeout(f.timer)
    this.#finishing = undefined
    if (f.deck.graph === this.#graph) f.deck.clear()
    else f.deck.graph.close()
    this.#plan()
  }

  // Drops the song loaded ahead: the other element lets it go, or its graph closes.
  #dropNext(): void {
    if (this.#ahead) this.#ahead.close()
    else if (this.#nextLoaded) this.#other.clear()
    this.#ahead = undefined
    this.#nextLoaded = false
  }

  // A song to load now at another rate: a new graph at its rate takes over,
  // and the old ones close. No graph at that rate: it plays in this one.
  #moveTo(rate: number): void {
    const g = this.#build(rate, true)
    if (!g) return
    this.#dropNext()
    const old = this.#graph
    const f = this.#finishing?.deck.graph
    // first, so the old elements' events are no longer this song's
    this.#graph = g
    this.#deck = g.decks[0]
    if (f && f !== old) this.#close(f)
    this.#close(old)
  }

  // every graph that may still sound
  #graphs(): Graph[] {
    const f = this.#finishing?.deck.graph
    return [
      this.#graph,
      ...(this.#ahead ? [this.#ahead] : []),
      ...(f && f !== this.#graph ? [f] : [])
    ]
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
  // other element (it takes over). A live stream always opens a new
  // connection. A song at another rate than the graph's gets a new graph.
  load(url: string, at = 0, part: Part = wholeFile, opts: LoadOptions = {}): void {
    this.#stopLate()
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
        if (this.#ahead) {
          const old = this.#graph
          this.#graph = this.#ahead
          this.#ahead = undefined
          this.#close(old)
        } else d.clear()
        o.setGain(gain)
      } else this.#deck.glideGain(gain)
      this.#sendDuration()
      this.seek(at)
      this.#on.time?.(at)
      return
    }
    // a stream has no end to start a next song at
    if (live) this.setNext()
    // a stream's rate is not known: it plays in the graph there is
    const rate = live ? this.#graph.rate : rateFor(opts.rate, this.#graph.rate)
    if (rate !== this.#graph.rate) this.#moveTo(rate)
    this.#deck.load(url, part.start + at, live, gain)
  }

  // The song after the one playing is the next part of the same file: the
  // sound goes on as it is, and times are from the new part from now on.
  // `gain` is the new part's level.
  continueWith(part: Part, gain = 1): void {
    this.#deck.glideGain(gain)
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
    this.#stopLate()
    const n = next && {
      url: next.url,
      ...(next.part ?? wholeFile),
      gain: next.gain ?? 1,
      rate: next.rate
    }
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
      } else this.#dropNext()
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
    const g = this.#graph
    const d = this.#deck
    // a new graph plays once its join is in
    if (!g.ready) {
      void g.joinLoaded.then(() => {
        if (this.#wantPlay && this.#deck === d) this.#playElement()
      })
      return
    }
    void g.context.resume()
    d.el.play().catch((e: DOMException) => {
      // AbortError: a newer load() came first. NotSupportedError: the error event handles it.
      if (e.name !== 'AbortError' && e.name !== 'NotSupportedError')
        this.#on.refused?.(`${e.name}: ${e.message}`)
    })
  }

  pause(): void {
    this.#stopLate()
    this.#wantPlay = false
    clearTimeout(this.#nextTimer)
    this.el.pause()
  }

  // `pos` seconds into the song
  seek(pos: number): void {
    this.#stopLate()
    if (!this.loaded) return
    this.#endSent = false
    clearTimeout(this.#nextTimer)
    this.#deck.seek(this.#part.start + pos)
  }

  setVolume(volume: number): void {
    this.#volume = gain(volume)
    for (const g of this.#graphs()) g.volume.gain.value = this.#volume
  }

  // A new level for the song playing (the setting changed): it glides there.
  setGain(gain: number): void {
    if (this.loaded) this.#deck.glideGain(gain)
  }

  // Nothing to play: drop both files so they stop loading. The graph stays.
  clear(): void {
    this.#stopLate()
    this.#wantPlay = false
    this.#part = wholeFile
    this.#next = undefined
    this.#nextFailed = false
    this.#skew = 0
    clearTimeout(this.#endTimer)
    clearTimeout(this.#nextTimer)
    this.#dropNext()
    const f = this.#finishing?.deck.graph
    if (f && f !== this.#graph) this.#close(f)
    clearTimeout(this.#finishing?.timer)
    this.#finishing = undefined
    for (const d of this.#graph.decks) d.clear()
  }
}

export const engine = new AudioEngine()
