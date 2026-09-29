// What plays: the queue or a radio station (decision 142). This store owns the
// engine's events and passes them to the side that plays. NowPlaying, the
// controls, the media session and the app colors read title, sub and art here.
import type { Art } from '../../../shared/library'
import type { SavedPlaying, SavedQueue } from '../../../shared/saved-queue'
import type { Station } from '../../../shared/stations'
import { engine, type EngineEvents } from '../audio/engine'
import { stepStation } from '../radio/logic'
import { player, seek as seekSong, togglePlay as toggleSong } from './player.svelte'
import { queue } from './queue.svelte'
import { radio } from './radio.svelte'

export type PlayingKind = 'queue' | 'radio'

// What the system's media controls show.
export interface MediaText {
  title: string
  artist: string
  album: string
}

const eventNames: (keyof EngineEvents)[] = [
  'time',
  'duration',
  'ended',
  'playing',
  'paused',
  'seeked',
  'refused',
  'error',
  'waiting'
]

class PlayingStore {
  kind: PlayingKind = $state('queue')

  title: string | undefined = $derived(
    this.kind === 'radio' ? radio.now.track || radio.station?.name : queue.current?.title
  )
  // Radio: the station under the song; before a song title comes, the title
  // is the station, so it isn't said twice.
  sub: string | undefined = $derived(
    this.kind === 'radio'
      ? radio.station && (radio.now.track ? radio.station.name : 'Radio')
      : queue.current && `${queue.current.artist} · ${queue.current.album}`
  )
  art: Art | undefined = $derived(this.kind === 'radio' ? radio.art : queue.currentArt)
  // A song sounds: the queue's playing marks (the bouncing bars) follow this,
  // not player.playing, which is the radio's while radio plays.
  songPlaying: boolean = $derived(this.kind === 'queue' && player.playing)
  // Radio: the title is the song, the artist the station.
  media: MediaText | undefined = $derived.by(() => {
    if (this.kind === 'radio') {
      const s = radio.station
      return s && { title: radio.now.track || s.name, artist: s.name, album: '' }
    }
    const t = queue.current
    return t && { title: t.title, artist: t.artist, album: t.album }
  })

  #saved = ''

  constructor() {
    const side = (): Partial<EngineEvents> => (this.kind === 'radio' ? radio.events : queue.events)
    const route: Partial<EngineEvents> = {}
    for (const name of eventNames) {
      route[name] = ((...args: unknown[]) =>
        (side()[name] as ((...a: unknown[]) => void) | undefined)?.(...args)) as never
    }
    engine.on(route)
    queue.takeOver = () => this.#toQueue()
  }

  // Radio takes the player; the queue keeps its list and place.
  async playStation(station: Station): Promise<void> {
    if (this.kind === 'queue') {
      queue.savePos()
      queue.active = false
    }
    this.kind = 'radio'
    this.#save({ kind: 'radio', station: station.id })
    await radio.play(station)
  }

  // "Back to queue": the queue's song, loaded paused at its place.
  backToQueue(): void {
    const was = this.kind
    this.#toQueue()
    if (was === 'radio') queue.resume()
  }

  #toQueue(): void {
    if (this.kind === 'queue') return
    radio.pause()
    this.kind = 'queue'
    queue.active = true
    this.#save({ kind: 'queue' })
  }

  // Play and pause for the play button, the Space key and the media keys.
  // Radio's pause drops the connection; play opens a new one at the live edge.
  togglePlay(): void {
    if (this.kind === 'queue') return toggleSong()
    if (radio.wanted) radio.pause()
    else void radio.resume()
  }

  play(): void {
    if (this.kind === 'radio') {
      if (!radio.wanted) void radio.resume()
    } else if (!player.playing) toggleSong()
  }

  pause(): void {
    if (this.kind === 'radio') radio.pause()
    else if (player.playing) toggleSong()
  }

  // A stream can't be sought, and player.pos is the queue's place while radio plays.
  seek(pos: number): void {
    if (this.kind === 'queue') seekSong(pos)
  }

  // Next and Previous: songs in the queue, or My stations on the radio.
  async next(): Promise<void> {
    if (this.kind === 'queue') return queue.next()
    await this.#step(1)
  }

  async prev(): Promise<void> {
    if (this.kind === 'queue') return queue.prev()
    await this.#step(-1)
  }

  async #step(by: 1 | -1): Promise<void> {
    const id = stepStation(radio.stations, radio.station?.id ?? '', by)
    const s = radio.stations.find((x) => x.id === id)
    if (s) await this.playStation(s)
  }

  // After a restart: radio comes back with its station, paused. A station no
  // longer in My stations (or one from search) gives the queue back.
  // `stationsRead` false: My stations could not be read this run, so radio is
  // not forgotten in queue.json; it comes back when they can be read.
  restore(saved: SavedQueue, stationsRead = true): void {
    const station =
      saved.kind === 'radio' ? radio.stations.find((s) => s.id === saved.station) : undefined
    // what queue.json holds now
    this.#saved = saved.kind === 'radio' ? `radio:${saved.station}` : 'queue'
    if (station) {
      this.kind = 'radio'
      queue.active = false
      radio.select(station)
    } else if (saved.kind === 'radio' && stationsRead) {
      this.#save({ kind: 'queue' })
    }
    queue.restore(saved)
  }

  #save(p: SavedPlaying): void {
    const key = p.kind === 'radio' ? `radio:${p.station}` : 'queue'
    if (key === this.#saved) return
    this.#saved = key
    window.playbackApi.savePlaying(p)
  }
}

export const playing = new PlayingStore()
