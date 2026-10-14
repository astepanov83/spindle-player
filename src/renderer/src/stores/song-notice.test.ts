import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { SongNotice } from '../../../shared/ipc'
import type { Art } from '../../../shared/library'
import type { ItemKey } from '../../../shared/plugins/items'
import type { ItemInfo } from '../plugins/types'
import { noticeOf, nowOf, settleMs, SongNotices, type Now, type Playing } from './song-notice'

const info = (i: Partial<ItemInfo>): ItemInfo => ({ title: 'Blue Song', ...i }) as ItemInfo
// made-up keys: the core's tests don't name a plugin
const songKey = 'song:1' as ItemKey
const stationKey = 'station:7' as ItemKey
const art = (cover: string): Art => ({ cover, coverLarge: '' }) as Art

describe('noticeOf', () => {
  it('has the title, then the artist and album, and the small cover', () => {
    const i = info({
      subtitle: 'The Blues',
      group: 'Blue Album',
      art: art('spindle://cover/small/x')
    })
    expect(noticeOf(i, false)).toEqual({
      title: 'Blue Song',
      body: 'The Blues · Blue Album',
      cover: 'spindle://cover/small/x'
    })
  })

  it('leaves out a missing artist or album, and a missing cover', () => {
    expect(noticeOf(info({ group: 'Blue Album' }), false)).toEqual({
      title: 'Blue Song',
      body: 'Blue Album'
    })
    expect(noticeOf(info({ subtitle: 'The Blues', art: art('') }), false)).toEqual({
      title: 'Blue Song',
      body: 'The Blues'
    })
    expect(noticeOf(info({}), false)).toEqual({ title: 'Blue Song', body: '' })
  })

  it('has none with no title', () => {
    expect(noticeOf(info({ title: '' }), false)).toBeUndefined()
  })

  it('has the station under a radio song', () => {
    const i = info({ title: 'Artist - Song', subtitle: 'Deep Space', mediaArtist: 'Deep Space' })
    expect(noticeOf(i, true)).toEqual({ title: 'Artist - Song', body: 'Deep Space' })
  })

  it('has "Radio" under a station before its first song title', () => {
    const i = info({ title: 'Deep Space', subtitle: 'Radio', mediaArtist: 'Deep Space' })
    expect(noticeOf(i, true)).toEqual({ title: 'Deep Space', body: 'Radio' })
  })
})

describe('nowOf', () => {
  const q = (p: Partial<Playing>): Playing => ({
    active: 'track',
    item: songKey,
    live: { current: null },
    info: info({ subtitle: 'The Blues' }),
    nothingPlaying: false,
    wantsSound: true,
    ...p
  })

  it('knows a song by its key', () => {
    expect(nowOf(q({})).id).toBe('track:song:1')
    expect(nowOf(q({ info: info({ title: 'Renamed' }) })).id).toBe('track:song:1')
  })

  it('knows a radio song by its station and title', () => {
    const live = q({ active: 'live', item: undefined, live: { current: stationKey } })
    expect(nowOf(live).id).toBe('live:station:7\nBlue Song')
    expect(nowOf({ ...live, info: info({ title: 'Next' }) }).id).toBe('live:station:7\nNext')
  })

  it('has nothing while nothing can be shown', () => {
    expect(nowOf(q({ nothingPlaying: true }))).toEqual({
      id: undefined,
      wantsSound: true,
      notice: undefined
    })
    expect(nowOf(q({ info: info({ unavailable: 'Not found' }) })).id).toBeUndefined()
  })
})

describe('SongNotices', () => {
  let sent: SongNotice[]
  let on: boolean
  let notices: SongNotices

  const song = (id: string, wantsSound = true): Now => ({
    id,
    wantsSound,
    notice: { title: id, body: '' }
  })

  beforeEach(() => {
    vi.useFakeTimers()
    sent = []
    on = true
    notices = new SongNotices(
      (n) => sent.push(n),
      () => on,
      { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as number) }
    )
  })
  afterEach(() => vi.useRealTimers())

  it('shows a new song once it has played about a second', () => {
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs - 1)
    expect(sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual([{ title: 'a', body: '' }])
  })

  it('shows only the last of a quick run of Next presses', () => {
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    for (const id of ['b', 'c', 'd']) {
      notices.see(song(id))
      vi.advanceTimersByTime(300)
    }
    vi.advanceTimersByTime(settleMs)
    expect(sent.map((n) => n.title)).toEqual(['a', 'd'])
  })

  it('shows nothing for Next and back within the wait', () => {
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    notices.see(song('b'))
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    expect(sent.map((n) => n.title)).toEqual(['a'])
  })

  it('shows nothing on pause, resume or a seek', () => {
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    notices.see(song('a', false))
    notices.see(song('a'))
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    expect(sent).toHaveLength(1)
  })

  it('shows nothing when the song loaded at start is played', () => {
    notices.see({ id: undefined, wantsSound: false, notice: undefined })
    notices.see(song('a', false))
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    expect(sent).toEqual([])
    notices.see(song('b'))
    vi.advanceTimersByTime(settleMs)
    expect(sent.map((n) => n.title)).toEqual(['b'])
  })

  it('shows the first song played when nothing was loaded at start', () => {
    notices.see({ id: undefined, wantsSound: false, notice: undefined })
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    expect(sent.map((n) => n.title)).toEqual(['a'])
  })

  it('shows a song picked while paused once it plays', () => {
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    notices.see(song('a', false))
    notices.see(song('b', false))
    vi.advanceTimersByTime(settleMs)
    expect(sent).toHaveLength(1)
    notices.see(song('b'))
    vi.advanceTimersByTime(settleMs)
    expect(sent.map((n) => n.title)).toEqual(['a', 'b'])
  })

  it('shows nothing for a song paused within the wait', () => {
    notices.see(song('a'))
    notices.see(song('a', false))
    vi.advanceTimersByTime(settleMs)
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    expect(sent).toEqual([])
  })

  it('shows the newest text, a cover that came in the wait', () => {
    notices.see(song('a'))
    notices.see({ ...song('a'), notice: { title: 'a', body: '', cover: 'c' } })
    vi.advanceTimersByTime(settleMs)
    expect(sent).toEqual([{ title: 'a', body: '', cover: 'c' }])
  })

  it('shows nothing while the setting is off', () => {
    on = false
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    expect(sent).toEqual([])
    // and turning it on later doesn't bring that song back
    on = true
    notices.see(song('a'))
    vi.advanceTimersByTime(settleMs)
    expect(sent).toEqual([])
  })

  it('shows a radio title change', () => {
    const radio = (title: string): Now => ({
      id: `live:station:7\n${title}`,
      wantsSound: true,
      notice: { title, body: 'Deep Space' }
    })
    notices.see(radio('Deep Space'))
    vi.advanceTimersByTime(settleMs)
    notices.see(radio('Artist - Song'))
    vi.advanceTimersByTime(settleMs)
    expect(sent.map((n) => n.title)).toEqual(['Deep Space', 'Artist - Song'])
  })
})
