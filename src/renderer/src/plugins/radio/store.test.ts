// Radio's page half played by the core's live queue, with a fake engine and a
// fake main: reconnect timing, the next stream after 3 failed retries, and
// stopping when all streams fail.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineError, EngineEvents } from '../../audio/engine'
import { itemKey } from '../../../../shared/plugins/items'
import type {
  LastAnswer,
  RadioCover,
  RadioLogo,
  RadioTitle
} from '../../../../shared/plugins/radio/ipc'
import { defaultPalettes, fallbackPalettes } from '../../../../shared/palette'
import type { HistoryEntry, Station } from '../../../../shared/plugins/radio/stations'

const fake = vi.hoisted(() => ({
  on: {} as Partial<EngineEvents>,
  loaded: false,
  paused: true,
  calls: [] as string[],
  urls: [] as string[]
}))

vi.mock('../../audio/engine', () => ({
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
    continueWith: () => {},
    setNext: () => {},
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
const history = vi.fn(async (): Promise<HistoryEntry[]> => [{ at: 1, title: 'Old - Song' }])
// main adds a new station to the end of My stations
const save = vi.fn(async (s: Station) => [...mine, s])
const remove = vi.fn(async (id: string) => mine.filter((s) => s.id !== id))
// main puts it back where it was
const restore = vi.fn(async () => mine)
// main moves the station to its new place
const move = vi.fn(async (id: string, to: number) => {
  const next = mine.filter((s) => s.id !== id)
  next.splice(
    to,
    0,
    mine.find((s) => s.id === id)!
  )
  return next
})
// what main last answered for the stream: by default, the server was not reached
let answer: LastAnswer | undefined
const lastAnswer = vi.fn(async () => answer)
const stop = vi.fn()
let titleListener: ((t: RadioTitle) => void) | undefined
let logoListener: ((l: RadioLogo) => void) | undefined
let coverListener: ((c: RadioCover) => void) | undefined
const log = vi.fn()
vi.stubGlobal('window', {
  playbackApi: { log, saveQueue: vi.fn(), savePlace: vi.fn(), savePlaying: vi.fn() },
  radioApi: {
    play,
    choose,
    save,
    remove,
    restore,
    move,
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
    },
    onCover: (l: (c: RadioCover) => void) => {
      coverListener = l
      return () => {}
    }
  }
})

const { radio } = await import('./store.svelte')
const { radioSearch } = await import('./search.svelte')
const { queues } = await import('../../stores/queues.svelte')
const { player } = await import('../../stores/player.svelte')
const { notice } = await import('../../stores/notice.svelte')
const { statusTip } = await import('../../queue/bar')
type ChoiceAction = import('../../queue/bar').ChoiceAction

// the bar's tooltip, from what radio told the core
const detail = (now = Date.now()): string => statusTip(queues.live.status, now)

// As the Radio tab plays a station: a saved one, or a result of its search.
// A changed copy of a saved station is saved that way first.
function playStation(s: Station): Promise<void> {
  if (radio.stations.some((x) => x.id === s.id))
    radio.stations = radio.stations.map((x) => (x.id === s.id ? s : x))
  else radioSearch.results = [s]
  return queues.playLive(itemKey('radio', s.id))
}
// the play button after a pause
const resume = async (): Promise<void> => await queues.play()
const pause = (): void => queues.pause()

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
// the engine's events, as the core passes them on
const ev = fake.on

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
  await playStation(s)
  fake.calls = []
}

describe('playing a station', () => {
  it('asks main first, then opens the stream live and plays', async () => {
    const p = playStation(mine[0])
    expect(fake.calls).toEqual(['clear'])
    expect(player.playing).toBe(true)
    await p
    expect(play).toHaveBeenCalledOnce()
    expect(fake.calls).toEqual(['clear', 'load spindle://radio/a?stream=0 live', 'play'])
  })

  it('plays the streams main found (Metal Only starts with none)', async () => {
    known = (s) => ({ ...s, streams: [{ url: 'https://m/1', bitrate: 128 }] })
    await playStation({ ...mine[0], streams: [] })
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
  })

  it('starts with the chosen stream', async () => {
    await playStation({ ...mine[1], chosen: 'https://b/2' })
    expect(loads()).toEqual(['load spindle://radio/b?stream=2 live'])
  })

  it('drops the answer for a station clicked before the last one', async () => {
    const first = playStation(mine[0])
    const second = playStation(mine[2])
    await Promise.all([first, second])
    expect(loads()).toEqual(['load spindle://radio/c?stream=0 live'])
    expect(radio.station?.id).toBe('c')
  })

  it('stops with a notice when main refuses the station', async () => {
    known = () => undefined
    await playStation(mine[0])
    expect(loads()).toEqual([])
    expect(player.playing).toBe(false)
    expect(notice.text).toBe("Station can't be reached: A")
  })

  it('pause drops the connection; play opens a new one', async () => {
    await start(mine[0])
    stop.mockClear()
    pause()
    // main stops the stream; the element keeps it, paused, so the system's
    // media controls stay (with no source Chromium drops them)
    expect(fake.calls).toEqual(['pause'])
    expect(stop).toHaveBeenCalledOnce()
    expect(player.playing).toBe(false)
    fake.calls = []
    await resume()
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
  })

  it('opens every connection at a new address, so Chromium can’t replay what it kept', async () => {
    fake.urls = []
    await start(mine[0])
    pause()
    await resume()
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
    await start(st('w', [128, 64]))
    ev.error!(four)
    await vi.advanceTimersByTimeAsync(0)
    expect(lastAnswer).toHaveBeenCalledWith('w')
    expect(loads()).toEqual(['load spindle://radio/w?stream=1 live'])
    // a live WMA stream never fails: it loads on with no sound
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(11999)
    expect(notice.text).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    expect(notice.text).toBe("Format can't be played: W")
    expect(player.playing).toBe(false)
  })

  it('error 4 when main answered 502 is a server not reached: retry', async () => {
    await start(st('x', [128, 64]))
    ev.error!(four)
    await vi.advanceTimersByTimeAsync(1000)
    expect(loads()).toEqual(['load spindle://radio/x?stream=0 live'])
  })

  it('a stream that played and then failed is retried, even with lots of audio passed', async () => {
    answer = { ok: true, bytes: 900000 }
    await start(st('y', [128, 64]))
    ev.playing!()
    ev.ended!()
    await vi.advanceTimersByTimeAsync(1000)
    expect(loads()).toEqual(['load spindle://radio/y?stream=0 live'])
    expect(lastAnswer).not.toHaveBeenCalled()
  })

  it('a server that played, then hangs, is retried at 1, 2 and 4 s, not taken for a format (final fix 1)', async () => {
    // main still says what the connection that played got until its 10 s timeout
    answer = { ok: true, bytes: 900000 }
    await start(st('z', [128, 64]))
    ev.playing!()
    // the server stops sending
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(8000)
    fake.calls = []
    for (const ms of [1000, 2000, 4000]) {
      await vi.advanceTimersByTimeAsync(ms)
      expect(loads()).toEqual(['load spindle://radio/z?stream=0 live'])
      fake.calls = []
      // the new connection waits for a server that never answers
      ev.waiting!()
      await vi.advanceTimersByTimeAsync(9999)
      expect(fake.calls).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      // main gives up after 10 s and answers 502
      answer = { ok: false, bytes: 0 }
      ev.error!(four)
      await vi.advanceTimersByTimeAsync(0)
      fake.calls = []
      answer = { ok: true, bytes: 900000 }
    }
    // 3 failed retries: the next stream, as for any network error
    expect(notice.text).toBe('')
    expect(radio.stream).toBe(1)
    answer = { ok: false, bytes: 0 }
    for (const ms of [8000, 16000, 30000]) {
      ev.error!(net)
      await vi.advanceTimersByTimeAsync(ms)
    }
    ev.error!(net)
    await vi.advanceTimersByTimeAsync(0)
    expect(notice.text).toBe("Station can't be reached: Z")
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
    pause()
    fake.calls = []
    ev.error!(net)
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fake.calls).toEqual([])
  })
})

describe('status, next to the dot', () => {
  it('connecting from the click until sound comes, then live', async () => {
    const p = playStation(mine[1])
    // main is still finding the streams
    expect(radio.status).toBe('connecting')
    await p
    expect(radio.status).toBe('connecting')
    expect(detail()).toBe('Connecting to 320 kbps')
    ev.waiting!()
    expect(radio.status).toBe('connecting')
    ev.playing!()
    expect(radio.status).toBe('live')
    expect(detail()).toBe('Live on 320 kbps')
  })

  it('buffering when data stops for 1 s after sound came, live again when it comes back', async () => {
    await start(mine[0])
    ev.playing!()
    // a short hiccup does not flash BUFFERING
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(500)
    ev.playing!()
    await vi.advanceTimersByTimeAsync(1000)
    expect(radio.status).toBe('live')
    ev.waiting!()
    await vi.advanceTimersByTimeAsync(999)
    expect(radio.status).toBe('live')
    await vi.advanceTimersByTimeAsync(1)
    expect(radio.status).toBe('buffering')
    ev.playing!()
    expect(radio.status).toBe('live')
  })

  it('reconnecting while it waits to retry, with the try and the time left', async () => {
    const t0 = Date.now()
    await start(mine[0])
    ev.playing!()
    ev.error!(net)
    expect(radio.status).toBe('reconnecting')
    expect(detail(t0)).toBe('Retry 1 of 3 on 128 kbps in 1 s')
    await vi.advanceTimersByTimeAsync(1000)
    // the new connection has no sound yet
    expect(radio.status).toBe('reconnecting')
    expect(detail()).toBe('Retry 1 of 3 on 128 kbps')
    ev.playing!()
    expect(radio.status).toBe('live')
  })

  it('says so when it moves to the next stream', async () => {
    await start({ ...mine[1], chosen: 'https://b/1' })
    for (const ms of [1000, 2000, 4000]) {
      ev.error!(net)
      await vi.advanceTimersByTimeAsync(ms)
    }
    ev.error!(net)
    await vi.advanceTimersByTimeAsync(0)
    expect(radio.status).toBe('reconnecting')
    expect(detail()).toBe('Trying another stream: 64 kbps')
  })

  it('off after pause, after giving up, and when main refuses the station', async () => {
    await start(mine[0])
    ev.playing!()
    pause()
    expect(radio.status).toBe('off')
    await start(mine[0])
    for (const ms of [1000, 2000, 4000, 0]) {
      ev.error!(net)
      await vi.advanceTimersByTimeAsync(ms)
    }
    expect(radio.status).toBe('off')
    known = () => undefined
    await playStation(mine[2])
    expect(radio.status).toBe('off')
  })

  it('connecting when the user picks another stream while playing', async () => {
    await start(mine[1])
    ev.playing!()
    radio.choose(2)
    expect(radio.status).toBe('connecting')
    expect(detail()).toBe('Connecting to 320 kbps')
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
    pause()
    fake.calls = []
    radio.choose(1)
    expect(fake.calls).toEqual([])
    expect(radio.stream).toBe(1)
  })

  it('tells main the choice for a station from search too, which keeps it on its copy (final fix 4)', async () => {
    const found = st('rb-1', [64, 128])
    await start(found)
    radio.choose(1)
    expect(choose).toHaveBeenCalledWith('rb-1', 'https://rb-1/1')
    expect(radio.station?.chosen).toBe('https://rb-1/1')
    await vi.advanceTimersByTimeAsync(0)
    // still not in My stations
    expect(radio.stations.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(radio.saved).toBe(false)
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

  it('drops a late list for the last station after another is picked', async () => {
    let reply: (h: { at: number; title: string }[]) => void = () => {}
    history.mockImplementationOnce(() => new Promise((r) => (reply = r)))
    await start(st('h2', [128]))
    await start(st('h3', [128]))
    await vi.waitFor(() => expect(radio.history).toEqual([{ at: 1, title: 'Old - Song' }]))
    reply([{ at: 7, title: 'From - A' }])
    await Promise.resolve()
    await Promise.resolve()
    expect(radio.station?.id).toBe('h3')
    expect(radio.history).toEqual([{ at: 1, title: 'Old - Song' }])
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
    const playing = playStation(q)
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

describe('the song’s cover (ticket 032)', () => {
  const logoHash = 'a'.repeat(40)
  const logo = { hash: logoHash, palette: fallbackPalettes('logo') }
  const cover = { hash: 'b'.repeat(40), palette: fallbackPalettes('song') }
  // a new station each test, so no history is left from the last one
  let n = 0
  let id = ''
  const fresh = (): Station => ({ ...st(`c${++n}`, [128]), logo })
  const heard = (title: string, at = 5, stationId = id): void =>
    titleListener!({ stationId, title, at })
  beforeEach(() => {
    id = `c${n + 1}`
  })

  it('shows the cover main found for the title playing, with its colors', async () => {
    await start(fresh())
    heard('Iron Maiden - The Trooper')
    coverListener!({ stationId: id, title: 'Iron Maiden - The Trooper', cover })
    expect(radio.art).toEqual({
      palette: cover.palette,
      cover: `spindle://cover/small/${cover.hash}`,
      coverLarge: `spindle://cover/large/${cover.hash}`
    })
    // the recent songs' row has it too
    expect(radio.history.at(-1)?.cover).toEqual(cover)
  })

  it('goes back to the logo on the next title', async () => {
    await start(fresh())
    heard('Iron Maiden - The Trooper')
    coverListener!({ stationId: id, title: 'Iron Maiden - The Trooper', cover })
    heard('Station Jingle', 6)
    expect(radio.art?.cover).toBe(`spindle://cover/small/${logoHash}`)
    // the row keeps its cover
    expect(radio.history.at(-2)?.cover).toEqual(cover)
  })

  it('drops a late answer for a title that changed', async () => {
    await start(fresh())
    heard('A - One')
    heard('B - Two', 6)
    coverListener!({ stationId: id, title: 'A - One', cover })
    expect(radio.art?.palette).toEqual(logo.palette)
    expect(radio.history.some((e) => e.cover)).toBe(false)
  })

  it('drops an answer for another station', async () => {
    await start(fresh())
    heard('A - One')
    coverListener!({ stationId: 'b', title: 'A - One', cover })
    expect(radio.art?.palette).toEqual(logo.palette)
  })

  it('takes the covers that come with main’s history, the title playing too', async () => {
    history.mockResolvedValueOnce([
      { at: 1, title: 'Old - Song', cover },
      { at: 2, title: 'Now - Playing', cover: { ...cover, small: true } }
    ])
    await start(fresh())
    heard('Now - Playing', 3)
    expect(radio.history[0].cover).toEqual(cover)
    // a small cover stays off the stage, as a small logo does
    expect(radio.art?.cover).toBe(`spindle://cover/small/${cover.hash}`)
    expect(radio.art?.coverLarge).toBe('')
  })
})

describe('the time listened', () => {
  const at = (): number => Math.round(queues.live.listened() / 1000)

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
    pause()
    await vi.advanceTimersByTimeAsync(60000)
    expect(at()).toBe(7)
    await resume()
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
    expect(queues.live.listened(stale)).toBe(0)
    await vi.advanceTimersByTimeAsync(5000)
    pause()
    const heard = queues.live.listened()
    const stale2 = Date.now()
    await resume()
    await vi.advanceTimersByTimeAsync(300)
    ev.playing!()
    expect(queues.live.listened(stale2)).toBe(heard)
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

describe('the bar, from what radio gives (ticket 058)', () => {
  const choice = (): ChoiceAction | undefined => queues.bar.choices[0]

  it('LIVE with no seek bar, Next, Previous, Shuffle or Repeat (decision 150)', async () => {
    await start(mine[1])
    expect(queues.bar).toMatchObject({
      live: true,
      seek: false,
      next: false,
      previous: false,
      order: false
    })
  })

  it('the stream picker: best sounding first, the playing stream picked, short for the bar', async () => {
    await start(mine[1])
    expect(choice()).toEqual({
      id: 'stream',
      kind: 'choice',
      label: 'Stream',
      short: '320k',
      options: [
        { id: '2', label: '320 kbps' },
        { id: '1', label: '128 kbps' },
        { id: '0', label: '64 kbps' }
      ],
      picked: '2'
    })
    // a station of My stations offers no Save
    expect(queues.bar.buttons).toEqual([])
  })

  it('picking a stream through the bar connects to it and is picked', async () => {
    await start(mine[1])
    ev.playing!()
    queues.act('stream', '0')
    expect(radio.stream).toBe(0)
    expect(choose).toHaveBeenCalledWith('b', 'https://b/0')
    expect(loads()).toEqual(['load spindle://radio/b?stream=0 live'])
    expect(choice()?.picked).toBe('0')
    expect(choice()?.short).toBe('64k')
  })

  it('Save for a station from search: busy while main saves, gone once saved', async () => {
    const found = st('rb-5', [128])
    await start(found)
    expect(queues.bar.buttons).toEqual([
      {
        id: 'save',
        kind: 'button',
        label: 'Save',
        icon: 'star',
        hint: 'Add to My stations',
        busy: false
      }
    ])
    save.mockClear()
    const done = vi.fn()
    save.mockImplementationOnce(
      (s: Station) => new Promise((ok) => done.mockImplementation(() => ok([...mine, s])))
    )
    queues.act('save')
    expect(save).toHaveBeenCalledWith(found)
    expect(queues.bar.buttons[0]).toMatchObject({ id: 'save', busy: true })
    // a second click while main saves is not passed on
    queues.act('save')
    expect(save).toHaveBeenCalledOnce()
    done()
    await vi.advanceTimersByTimeAsync(0)
    expect(radio.saved).toBe(true)
    expect(queues.bar.buttons).toEqual([])
  })

  it('one stream: its label, nothing to pick', async () => {
    await start(mine[0])
    expect(choice()?.options).toEqual([{ id: '0', label: '128 kbps' }])
  })

  it('the status reaches the bar; stopped is none', async () => {
    await start(mine[0])
    expect(queues.live.status).toMatchObject({ state: 'connecting' })
    ev.playing!()
    expect(queues.live.status).toEqual({ state: 'live', text: 'Live on 128 kbps' })
    pause()
    expect(queues.live.status).toBeUndefined()
  })
})

describe('My stations from the Radio view (ticket 029)', () => {
  it('saves a search result that is not playing', async () => {
    await start(mine[0])
    const found = st('rb-9', [128])
    save.mockClear()
    await radio.save(found)
    expect(save).toHaveBeenCalledWith(found)
    expect(radio.stations.at(-1)?.id).toBe('rb-9')
    // the station playing is not touched
    expect(radio.station?.id).toBe('a')
  })

  it('does not save a station twice', async () => {
    save.mockClear()
    await radio.save(mine[2])
    expect(save).not.toHaveBeenCalled()
  })

  it('removing the playing station does not stop it: it becomes unsaved', async () => {
    await start(mine[1])
    await radio.remove('b')
    expect(remove).toHaveBeenCalledWith('b')
    expect(radio.stations.map((s) => s.id)).toEqual(['a', 'c'])
    expect(radio.station?.id).toBe('b')
    expect(player.playing).toBe(true)
    expect(fake.calls).toEqual([])
    expect(radio.saved).toBe(false)
  })

  it('says what was removed, with an Undo that puts it back (ticket 045)', async () => {
    await radio.remove('b')
    expect(notice.text).toBe('Removed B')
    expect(notice.action?.label).toBe('Undo')
    notice.press()
    await vi.waitFor(() => expect(radio.stations.map((s) => s.id)).toEqual(['a', 'b', 'c']))
    expect(restore).toHaveBeenCalledWith('b')
  })

  it('moves a station to a place, shown before main answers', async () => {
    const job = radio.move('c', 0)
    expect(radio.stations.map((s) => s.id)).toEqual(['c', 'a', 'b'])
    await job
    expect(move).toHaveBeenCalledWith('c', 0)
    expect(radio.stations.map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('asks main nothing for a move to where it is', async () => {
    await radio.move('a', 0)
    expect(move).not.toHaveBeenCalled()
  })

  it('puts the list back when main could not move it', async () => {
    move.mockRejectedValueOnce(new Error('no'))
    await radio.move('c', 0)
    expect(radio.stations.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(log).toHaveBeenCalledWith('Radio c: radio:move failed: Error: no')
  })

  it('shows a notice when main could not remove it', async () => {
    remove.mockRejectedValueOnce(new Error('no'))
    await radio.remove('a')
    expect(notice.text).toBe("Couldn't remove A")
    expect(radio.stations.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('events from main at start (final fix 5)', () => {
  it('hears logos from the start, and applies one sent before My stations came', async () => {
    const before = { titleListener, logoListener, coverListener }
    logoListener = undefined
    vi.resetModules()
    const { radio: fresh } = await import('./store.svelte')
    try {
      // made at start from the shipped file, before the page has the list
      expect(logoListener).toBeDefined()
      const logo = { hash: 'c'.repeat(40), palette: fallbackPalettes('m') }
      logoListener!({ id: 'b', logo })
      fresh.load(mine)
      expect(fresh.stations[1].logo).toEqual(logo)
      expect(fresh.stations[0].logo).toBeUndefined()
      // from then on straight into the list
      logoListener!({ id: 'a', logo })
      expect(fresh.stations[0].logo).toEqual(logo)
    } finally {
      ;({ titleListener, logoListener, coverListener } = before)
    }
  })
})

describe('streams a search added to My stations', () => {
  it('update the list and the playing station, and the stream plays on', async () => {
    await start(mine[0])
    const more: Station = {
      ...mine[0],
      streams: [...mine[0].streams, { url: 'https://a/9', bitrate: 64 }]
    }
    radio.searched([more, mine[1], mine[2]])
    expect(radio.stations[0]).toBe(more)
    expect(radio.station).toBe(more)
    expect(radio.stream).toBe(0)
    expect(fake.calls).toEqual([])
  })

  it('leave a station from search alone', async () => {
    const found = st('rb-1', [128])
    await start(found)
    radio.searched(mine)
    expect(radio.station).toEqual(found)
  })
})
