// One Web Audio graph at one sample rate (ticket 091): an AudioContext, two
// <audio> elements each with its own gain (decks), the join, the analyser
// and the volume. The engine (engine.ts) makes a new one when a song comes
// at another rate, and closes the old one once its song has sounded out. An
// element is tied to the context it was first connected to, so each graph
// has elements of its own.
import { lookaheadFor, ringSize, type JoinIn, type JoinOut } from './join'
import joinUrl from './join-worklet?worker&url'
import { fftSizeFor } from './rate'

// A change of level on a song that plays glides this fast (a time constant,
// in seconds), so it makes no click.
const glide = 0.02

// One <audio> element with its own gain, into its graph.
export class Deck {
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

  constructor(
    readonly graph: Graph,
    // its input on the join
    readonly i: number
  ) {
    const el = new Audio()
    // Without this the analyser only gets silence: spindle:// answers with CORS headers.
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    this.el = el
    this.gain = graph.context.createGain()
    graph.context.createMediaElementSource(el).connect(this.gain).connect(graph.analyser)
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
  glideGain(gain: number): void {
    this.level = gain
    const p = this.gain.gain
    const now = this.graph.context.currentTime
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

  // tells the join this element has a new song, or none
  #reset(): void {
    this.graph.tell({ reset: this.i })
  }
}

export interface GraphOptions {
  // the volume's gain factor
  volume: number
  // A graph made for a song to play now waits for its join before playing,
  // so the join is not put in while the song plays (a skip of 9 ms). The
  // first one does not: its join loads long before anyone can press Play.
  waits: boolean
  // the join let a next song through
  joined(g: Graph, m: JoinOut): void
}

export class Graph {
  readonly context: AudioContext
  readonly analyser: AnalyserNode
  // Volume is set here, after the analyser, so the visualizer sees the same
  // levels at any volume. The elements themselves stay at full volume.
  readonly volume: GainNode
  readonly decks: [Deck, Deck]
  // the join, once its worklet loaded; until then (or if it fails) the
  // elements go to the analyser as they are
  join: AudioWorkletNode | undefined
  // it can play now: see GraphOptions.waits
  ready: boolean
  // once the join loaded, or failed to
  readonly joinLoaded: Promise<void>

  constructor(rate: number, o: GraphOptions) {
    // Chromium takes the graph's sound to the device's rate in one go.
    this.context = new AudioContext({ sampleRate: rate })
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = fftSizeFor(this.context.sampleRate)
    this.analyser.smoothingTimeConstant = 0.5
    this.volume = this.context.createGain()
    this.volume.gain.value = o.volume
    this.analyser.connect(this.volume).connect(this.context.destination)
    this.decks = [new Deck(this, 0), new Deck(this, 1)]
    this.ready = !o.waits
    this.joinLoaded = this.#loadJoin(o.joined).finally(() => (this.ready = true))
  }

  get rate(): number {
    return this.context.sampleRate
  }

  // Seconds from a deck's input to the speakers: the join's lookahead, then
  // the output's.
  get delay(): number {
    return (this.join ? lookaheadFor(this.rate) / this.rate : 0) + this.outDelay
  }

  // Seconds from the sound rendered now to the speakers. getOutputTimestamp
  // follows the device; outputLatency is a fixed guess (20 ms off at 96 kHz,
  // measured), used until the context runs.
  get outDelay(): number {
    const c = this.context
    const ts = c.getOutputTimestamp?.()
    const out = ts?.performanceTime
      ? (ts.performanceTime - performance.now()) / 1000 + c.currentTime - (ts.contextTime ?? 0)
      : (c.baseLatency || 0) + (c.outputLatency || 0)
    return Math.max(0, out)
  }

  other(d: Deck): Deck {
    return this.decks[d.i ? 0 : 1]
  }

  async #loadJoin(joined: GraphOptions['joined']): Promise<void> {
    try {
      await this.context.audioWorklet.addModule(joinUrl)
    } catch (e) {
      console.error('The gapless join did not load; songs still play, each start a few ms off', e)
      return
    }
    // closed while it loaded
    if (this.context.state === 'closed') return
    const join = new AudioWorkletNode(this.context, 'spindle-join', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      // mono and 5.1 come in as two channels, as the speakers would get them
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { ring: ringSize(this.rate), lookahead: lookaheadFor(this.rate) }
    })
    join.port.onmessage = (e: MessageEvent<JoinOut>) => joined(this, e.data)
    for (const d of this.decks) {
      d.gain.disconnect()
      d.gain.connect(join, 0, d.i)
    }
    join.connect(this.analyser)
    this.join = join
  }

  tell(m: JoinIn): void {
    this.join?.port.postMessage(m)
  }

  // Stops both elements and lets the context go.
  close(): void {
    for (const d of this.decks) d.clear()
    if (this.join) this.join.port.onmessage = null
    this.context.close().catch((e) => console.error('An audio graph did not close', e))
  }
}
