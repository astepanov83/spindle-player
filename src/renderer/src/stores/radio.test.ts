// The radio store with a fake engine and a fake main: reconnect timing, the
// next stream after 3 failed retries, and stopping when all streams fail.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineError, EngineEvents } from '../audio/engine'
import type { LastAnswer, RadioLogo, RadioTitle } from '../../../shared/ipc'
import { defaultPalettes, fallbackPalettes } from '../../../shared/palette'
import type { Station } from '../../../shared/stations'

const fake = vi.hoisted(() => ({
  on: {} as Partial<EngineEvents>,
  loaded: false,
  paused: true,
  calls: [] as string[],
  urls: [] as string[]
}))

vi.mock('../audio/engine', () => ({
  mediaUrl: (id: string) => `media/${id}`,
  engine: {
    on: (e: Partial<EngineEvents>) => Object.assign(fake.on, e),
    get loaded() {
      return fake.loaded
    },
    el: {
      get paused() {
        return fake.paused
      }
    },
    load: (url: string, ...rest: [number?, unknown?, { live?: boolean }?]) => {
      const opts = rest[2]
      fake.loaded = true
      // each connection has its own address; the tests read them without it
      fake.urls.push(url)
      fake.calls.push(`load ${url.replace(/&c=\d+$/, '')}${opts?.live ? ' live' : ''}`)
    },
    play: () => {
      fake.paused = false
      fake.calls.push('play')
    },
    pause: () => {
      fake.paused = true
      fake.calls.push('pause')
    },
    seek: () => {},
    clear: () => {
      fake.loaded = false
      fake.paused = true
      fake.calls.push('clear')
    },
    setVolume: () => {}
  }
}))

// main: radio:play answers with the station as it knows it
let known: (s: Station) => Station | undefined = (s) => s
const play = vi.fn(async (s: Station) => known(s))
const choose = vi.fn(async (id: string, url: string) =>
  mine.map((s) => (s.id === id ? { ...s, chosen: url } : s))
)
const history = vi.fn(async () => [{ at: 1, title: 'Old - Song' }])
// main adds a new station to the end of My stations
const save = vi.fn(async (s: Station) => [...mine, s])
// what main last answered for the stream: by default, the server was not reached
let answer: LastAnswer | undefined
const lastAnswer = vi.fn(async () => answer)
const stop = vi.fn()
let titleListener: ((t: RadioTitle) => void) | undefined
let logoListener: ((l: RadioLogo) => void) | undefined
const log = vi.fn()
vi.stubGlobal('window', {
  playbackApi: { log, saveQueue: vi.fn(), savePlace: vi.fn(), savePlaying: vi.fn() },
  radioApi: {
    play,
    choose,
    save,
    history,
    lastAnswer,
    stop,
    onTitle: (l: (t: RadioTitle) => void) => {
      titleListener = l
      return () => {}
    },
    onLogo: (l: (t: RadioLogo) => void) => {
      logoListener = l
      return () => {}
    }
  }
})

const { radio } = await import('./radio.svelte')
const { player } = await import('./player.svelte')
const { notice } = await import('./notice.svelte')

const st = (id: string, bitrates: (number | undefined)[]): Station => ({
  id,
  name: id.toUpperCase(),
  tags: [],
  streams: bitrates.map((b, i) =>
    b ? { url: `https://${id}/${i}`, bitrate: b } : { url: `https://${id}/${i}` }
  )
})
let mine: Station[] = []

const net: EngineError = { code: 2, message: 'net::ERR_FAILED', gone: false }
// what Chromium gives when main answers 502, and for a format it can't read
const four: EngineError = {
  code: 4,
  message: 'PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed',
  gone: false
}

const loads = (): string[] => fake.calls.filter((c) => c.startsWith('load'))
// the engine's events go to the radio side (playing.svelte.ts does this in the app)
const ev = radio.events

beforeEach(async () => {
  vi.useFakeTimers()
  known = (s) => s
  answer = { ok: false, bytes: 0 }
  lastAnswer.mockClear()
  mine = [st('a', [128]), st('b', [64, 128, 320]), st('c', [128])]
  radio.load(mine)
  radio.pause()
  notice.text = ''
  fake.calls = []
  play.mockClear()
  choose.mockClear()
})
afterEach(() => vi.useRealTimers())

async function start(s: Station): Promise<void> {
  await radio.play(s)
  fake.calls = []
}

describe('playing a station', () => {
  it('asks main first, then opens the stream live and plays', async () => {
    const p = radio.play(mine[0])
    expect(fake.calls).toEqual(['clear'])
    expect(player.playing).toBe(true)
    await p
    expect(play).toHaveBeenCalledOnce()
    expect(fake.calls).toEqual(['clear', 'load spindle://radio/a?stream=0 live', 'play'])
  })

  it('plays the streams main found (Metal Only starts with none)', async () => {
    known = (s) => ({ ...s, streams: [{ url: 'https://m/1', bitrate: 128 }] })
    await radio.play({ ...mine[0], streams: [] })
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
  })

  it('starts with the chosen stream', async () => {
    await radio.play({ ...mine[1], chosen: 'https://b/2' })
    expect(loads()).toEqual(['load spindle://radio/b?stream=2 live'])
  })

  it('drops the answer for a station clicked before the last one', async () => {
    const first = radio.play(mine[0])
    const second = radio.play(mine[2])
    await Promise.all([first, second])
    expect(loads()).toEqual(['load spindle://radio/c?stream=0 live'])
    expect(radio.station?.id).toBe('c')
  })

  it('stops with a notice when main refuses the station', async () => {
    known = () => undefined
    await radio.play(mine[0])
    expect(loads()).toEqual([])
    expect(player.playing).toBe(false)
    expect(notice.text).toBe("Station can't be reached: A")
  })

  it('pause drops the connection; play opens a new one', async () => {
    await start(mine[0])
    stop.mockClear()
    radio.pause()
    // main stops the stream; the element keeps it, paused, so the system's
    // media controls stay (with no source Chromium drops them)
    expect(fake.calls).toEqual(['pause'])
    expect(stop).toHaveBeenCalledOnce()
    expect(player.playing).toBe(false)
    fake.calls = []
    await radio.resume()
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
  })

  it('opens every connection at a new address, so Chromium can’t replay what it kept', async () => {
    fake.urls = []
    await start(mine[0])
    radio.pause()
    await radio.resume()
    expect(fake.urls).toHaveLength(2)
    expect(fake.urls[0]).toMatch(/^spindle:\/\/radio\/a\?stream=0&c=\d+$/)
    expect(fake.urls[1]).not.toBe(fake.urls[0])
  })
})

describe('reconnecting', () => {
  it('retries the same stream after 1, 2 and 4 s', async () => {
    await start(mine[0])
    ev.error!(net)
    expect(fake.calls).toEqual(['clear'])
    await vi.advanceTimersByTimeAsync(999)
    expect(loads()).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
    ev.error!(four)
    await vi.advanceTimersByTimeAsync(1999)
    expect(loads()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(loads()).toHaveLength(2)
    ev.ended!()
    await vi.advanceTimersByTimeAsync(3999)
    expect(loads()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(loads()).toHaveLength(3)
  })

  it('after 3 failed retries takes the next stream, nearest bitrate first, and waits longer', async () => {
    await start({ ...mine[1], chosen: 'https://b/1' })
    for (const ms of [1000, 2000, 4000]) {
      ev.error!(net)
      await vi.advanceTimersByTimeAsync(ms)
    }
    fake.calls = []
    ev.error!(net)
    await vi.advanceTimersByTimeAsync(0)
    // 128 failed: 64 and 320 are both 64 away; the lower one first, at once
    expect(loads()).toEqual(['load spindle://radio/b?stream=0 live'])
    fake.calls = []
    ev.error!(net)
    await vi.advanceTimersByTimeAsync(7999)
    expect(loads()).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(loads()).toEqual(['load spindle://radio/b?stream=0 live'])
  })

  it('stops when every stream has failed: "Station can\'t be reached"', async () => {
    await start(mine[0])
    for (const ms of [1000, 2000, 4000]) {
      ev.error!(net)
      await vi.advanceTimersByTimeAsync(ms)
    }
    fake.calls = []
    ev.error!(net)
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.calls).toEqual(['clear', 'pause'])
    expect(player.playing).toBe(false)
    expect(notice.text).toBe("Station can't be reached: A")
    await vi.advanceTimersByTimeAsync(60000)
    expect(loads()).toEqual([])
  })

  it('audio from main but no sound is a format: next stream at once; all: "Format can\'t be played"', async () => {
    answer = { ok: true, bytes: 64000 }
    await start(st('w', [64, 128]))
    ev.error!(four)
    await vi.advanceTimersByTimeAsync(0)
    expect(lastAnswer).toHaveBeenCalledWith('w')
    expect(loads()).toEqual(['load spindle://radio/w?stream=1 live'])
    // a live WMA stream never fails: it loads on with no sound
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(8000)
    expect(notice.text).toBe("Format can't be played: W")
    expect(player.playing).toBe(false)
  })

  it('error 4 when main answered 502 is a server not reached: retry', async () => {
    await start(st('x', [64, 128]))
    ev.error!(four)
    await vi.advanceTimersByTimeAsync(1000)
    expect(loads()).toEqual(['load spindle://radio/x?stream=0 live'])
  })

  it('a stream that played and then failed is retried, even with lots of audio passed', async () => {
    answer = { ok: true, bytes: 900000 }
    await start(st('y', [64, 128]))
    ev.playing!()
    ev.ended!()
    await vi.advanceTimersByTimeAsync(1000)
    expect(loads()).toEqual(['load spindle://radio/y?stream=0 live'])
    expect(lastAnswer).not.toHaveBeenCalled()
  })

  it('reconnects after waiting more than 8 s for data, not less', async () => {
    await start(mine[0])
    ev.playing!()
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(5000)
    ev.playing!()
    await vi.advanceTimersByTimeAsync(10000)
    expect(fake.calls).toEqual([])
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(8000)
    expect(fake.calls).toEqual(['clear'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
  })

  it('sound coming out starts the count again', async () => {
    await start(mine[0])
    for (const ms of [1000, 2000, 4000]) {
      ev.error!(net)
      await vi.advanceTimersByTimeAsync(ms)
    }
    ev.playing!()
    fake.calls = []
    ev.error!(net)
    await vi.advanceTimersByTimeAsync(1000)
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
  })

  it('does nothing after the user paused', async () => {
    await start(mine[0])
    ev.error!(net)
    radio.pause()
    fake.calls = []
    ev.error!(net)
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fake.calls).toEqual([])
  })
})

describe('choosing a stream', () => {
  it('opens it at the live edge and saves it as the station’s choice', async () => {
    await start(mine[1])
    radio.choose(2)
    expect(fake.calls).toEqual(['clear', 'load spindle://radio/b?stream=2 live', 'play'])
    expect(choose).toHaveBeenCalledWith('b', 'https://b/2')
    await vi.advanceTimersByTimeAsync(0)
    expect(radio.stations.find((s) => s.id === 'b')?.chosen).toBe('https://b/2')
  })

  it('while paused only picks it', async () => {
    await start(mine[1])
    radio.pause()
    fake.calls = []
    radio.choose(1)
    expect(fake.calls).toEqual([])
    expect(radio.stream).toBe(1)
  })

  it('keeps the choice of a station from search in the page', async () => {
    const found = st('rb-1', [64, 128])
    await start(found)
    radio.choose(1)
    expect(choose).not.toHaveBeenCalled()
    expect(radio.station?.chosen).toBe('https://rb-1/1')
  })
})

describe('titles', () => {
  it('takes the playing station’s titles and splits them', async () => {
    await start(mine[0])
    titleListener!({ stationId: 'b', title: 'Other - One', at: 2 })
    expect(radio.title).toBe('')
    titleListener!({ stationId: 'a', title: 'Iron Maiden - Powerslave * Blacky OnAir *', at: 3 })
    expect(radio.now.artist).toBe('Iron Maiden')
    expect(radio.now.song).toBe('Powerslave')
    expect(radio.history.at(-1)).toEqual({
      at: 3,
      title: 'Iron Maiden - Powerslave * Blacky OnAir *'
    })
  })
})

describe('recent songs (031)', () => {
  it('adds titles as main does: trimmed, and a reconnect’s repeat dropped', async () => {
    await start(st('h0', [128]))
    await vi.waitFor(() => expect(radio.history).toHaveLength(1))
    titleListener!({ stationId: 'h0', title: ' Dio - Holy Diver ', at: 5 })
    titleListener!({ stationId: 'h0', title: 'Dio - Holy Diver', at: 6 })
    expect(radio.history).toEqual([
      { at: 1, title: 'Old - Song' },
      { at: 5, title: 'Dio - Holy Diver' }
    ])
  })

  it('keeps main’s list when a title came before it answered', async () => {
    let reply: (h: { at: number; title: string }[]) => void = () => {}
    history.mockImplementationOnce(() => new Promise((r) => (reply = r)))
    await start(st('h1', [128]))
    titleListener!({ stationId: 'h1', title: 'New - One', at: 9 })
    // main added the title to its file before it sent it
    reply([
      { at: 1, title: 'Old - Song' },
      { at: 9, title: 'New - One' }
    ])
    await vi.waitFor(() => expect(radio.history).toHaveLength(2))
    expect(radio.history[0].title).toBe('Old - Song')
  })
})

describe('late answers and outside pauses (027 fix round 1)', () => {
  it('main’s answer about the last station’s connection does not act on the new one', async () => {
    answer = { ok: true, bytes: 64000 }
    let reply: (a: LastAnswer) => void = () => {}
    lastAnswer.mockImplementationOnce(() => new Promise<LastAnswer>((r) => (reply = r)))
    await start(st('p', [128]))
    // p fails before any sound; main has not answered yet
    ev.error!(four)
    let known: (s: Station | undefined) => void = () => {}
    play.mockImplementationOnce(() => new Promise<Station | undefined>((r) => (known = r)))
    const q = st('q', [128])
    const playing = radio.play(q)
    // the reply about p comes while q waits for radio:play
    reply({ ok: true, bytes: 64000 })
    await vi.advanceTimersByTimeAsync(0)
    known(q)
    await playing
    expect(notice.text).toBe('')
    expect(radio.wanted).toBe(true)
    expect(loads()).toEqual(['load spindle://radio/q?stream=0 live'])
    await vi.advanceTimersByTimeAsync(60000)
    expect(loads()).toEqual(['load spindle://radio/q?stream=0 live'])
  })

  it('a pause from outside the app (the system) is a pause: the stream stops', async () => {
    await start(mine[0])
    ev.playing!()
    fake.paused = true
    ev.paused!()
    expect(radio.wanted).toBe(false)
    expect(player.playing).toBe(false)
    expect(stop).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60000)
    expect(loads()).toEqual([])
  })

  it('its own pauses (a reconnect, another stream) are not taken for one', async () => {
    await start(mine[1])
    // a reconnect clears the element: the pause event comes with no source
    ev.error!(net)
    ev.paused!()
    expect(radio.wanted).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    // choosing a stream loads the next at once: the pause event finds it playing
    radio.choose(2)
    ev.paused!()
    expect(radio.wanted).toBe(true)
  })
})

describe('the station’s logo', () => {
  const hash = 'a'.repeat(40)
  const logo = { hash, palette: fallbackPalettes('logo') }

  it('is a tile in the fixed colors until main made the logo', async () => {
    await start(mine[0])
    expect(radio.art).toEqual({ palette: defaultPalettes, cover: '', coverLarge: '' })
  })

  it('becomes the cover and the colors when main made it', async () => {
    await start(mine[0])
    logoListener!({ id: 'a', logo })
    expect(radio.art).toEqual({
      palette: logo.palette,
      cover: `spindle://cover/small/${hash}`,
      coverLarge: `spindle://cover/large/${hash}`
    })
    expect(radio.stations[0].logo).toEqual(logo)
    // another station's logo changes only that one
    logoListener!({ id: 'b', logo: { ...logo, small: true } })
    expect(radio.art?.coverLarge).toBe(`spindle://cover/large/${hash}`)
    expect(radio.stations[1].logo?.small).toBe(true)
  })

  it('a small logo is a tile in its colors on the stage', async () => {
    await start({ ...mine[0], logo: { ...logo, small: true } })
    expect(radio.art?.palette).toEqual(logo.palette)
    expect(radio.art?.coverLarge).toBe('')
  })

  it('goes back to the tile when main drops it', async () => {
    await start({ ...mine[0], logo })
    logoListener!({ id: 'a' })
    expect(radio.art?.palette).toEqual(defaultPalettes)
  })
})

describe('the time listened', () => {
  const at = (): number => Math.round(radio.listened() / 1000)

  it('counts only while sound comes out', async () => {
    await start(mine[0])
    await vi.advanceTimersByTimeAsync(5000)
    expect(at()).toBe(0)
    ev.playing!()
    await vi.advanceTimersByTimeAsync(10000)
    expect(at()).toBe(10)
    // buffering, and a dropped stream until it plays again
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(3000)
    expect(at()).toBe(10)
    ev.playing!()
    await vi.advanceTimersByTimeAsync(2000)
    ev.error!(net)
    await vi.advanceTimersByTimeAsync(4000)
    expect(at()).toBe(12)
  })

  it('stop keeps it; play again on the same station goes on from there', async () => {
    // another station than the test before, whose time would go on
    await start(mine[2])
    ev.playing!()
    await vi.advanceTimersByTimeAsync(7000)
    radio.pause()
    await vi.advanceTimersByTimeAsync(60000)
    expect(at()).toBe(7)
    await radio.resume()
    ev.playing!()
    await vi.advanceTimersByTimeAsync(1000)
    expect(at()).toBe(8)
  })

  it('never goes below what was heard when asked with a time from before the sound started', async () => {
    // the controls' tick keeps its own now, up to 1 s old
    await start(mine[1])
    const stale = Date.now()
    await vi.advanceTimersByTimeAsync(400)
    ev.playing!()
    expect(radio.listened(stale)).toBe(0)
    await vi.advanceTimersByTimeAsync(5000)
    radio.pause()
    const heard = radio.listened()
    const stale2 = Date.now()
    await radio.resume()
    await vi.advanceTimersByTimeAsync(300)
    ev.playing!()
    expect(radio.listened(stale2)).toBe(heard)
  })

  it('starts from 0 on another station', async () => {
    await start(mine[0])
    ev.playing!()
    await vi.advanceTimersByTimeAsync(7000)
    await start(mine[1])
    expect(at()).toBe(0)
    ev.playing!()
    await vi.advanceTimersByTimeAsync(3000)
    expect(at()).toBe(3)
  })
})

describe('saving the station', () => {
  it('a station from search is not saved until Save; then it is in My stations', async () => {
    const found = st('rb-1', [64, 128])
    await start(found)
    expect(radio.saved).toBe(false)
    await radio.save()
    expect(save).toHaveBeenCalledWith(found)
    expect(radio.saved).toBe(true)
    expect(radio.stations.at(-1)?.id).toBe('rb-1')
  })

  it('a second click while saving sends nothing more', async () => {
    const found = st('rb-2', [128])
    await start(found)
    save.mockClear()
    const first = radio.save()
    const second = radio.save()
    await Promise.all([first, second])
    expect(save).toHaveBeenCalledOnce()
    expect(radio.saved).toBe(true)
  })

  it('a station of My stations is saved already', async () => {
    await start(mine[1])
    expect(radio.saved).toBe(true)
  })
})
