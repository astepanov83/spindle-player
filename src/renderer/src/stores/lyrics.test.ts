// The words follow the song that plays: asked once per song, late answers
// for an older song dropped, shown per layout.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lyrics } from '../../../shared/lyrics'

const get = vi.fn<(key: string, song?: unknown) => Promise<Lyrics | undefined>>()
vi.stubGlobal('window', { lyricsApi: { get } })

const { lyrics } = await import('./lyrics.svelte')
const { settings } = await import('./settings.svelte')

const song = { artist: 'A', title: 'T', album: 'B', duration: 10 }

beforeEach(async () => {
  get.mockReset()
  await lyrics.follow(undefined, () => undefined)
})

describe('lyrics', () => {
  it('asks once per song, with what the page shows of it', async () => {
    get.mockResolvedValue({ plain: 'words' })
    await lyrics.follow('files:a', () => song)
    await lyrics.follow('files:a', () => song)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('files:a', song)
    expect(lyrics.words).toEqual({ plain: 'words' })
  })

  it("drops the last song's words at once, and late words for it", async () => {
    let answer: (l: Lyrics) => void = () => {}
    get.mockReturnValueOnce(new Promise((r) => (answer = r)))
    get.mockResolvedValueOnce({ plain: 'second' })
    const first = lyrics.follow('files:a', () => song)
    await lyrics.follow('files:b', () => song)
    answer({ plain: 'first' })
    await first
    expect(lyrics.words).toEqual({ plain: 'second' })
    await lyrics.follow(undefined, () => song)
    expect(lyrics.words).toBeUndefined()
  })

  it('tells an instrumental song from one with words', async () => {
    get.mockResolvedValueOnce({ instrumental: true })
    await lyrics.follow('files:g', () => song)
    expect(lyrics.instrumental).toBe(true)
    expect(lyrics.hasWords).toBe(false)
    get.mockResolvedValueOnce({ plain: 'w' })
    await lyrics.follow('files:h', () => song)
    expect(lyrics.instrumental).toBe(false)
    expect(lyrics.hasWords).toBe(true)
  })

  it('has none when the ask fails', async () => {
    get.mockRejectedValue(new Error('gone'))
    await lyrics.follow('files:c', () => song)
    expect(lyrics.words).toBeUndefined()
  })

  it('is shown per layout, and showing only with words', async () => {
    settings.template = 'studio'
    settings.lyricsShown = { studio: false, classic: false, focus: true }
    expect(lyrics.shown).toBe(false)
    lyrics.toggle()
    expect(settings.lyricsShown).toEqual({ studio: true, classic: false, focus: true })
    expect(lyrics.showing).toBe(false)
    get.mockResolvedValue({ plain: 'w' })
    await lyrics.follow('files:d', () => song)
    expect(lyrics.showing).toBe(true)
    settings.template = 'mini'
    expect(lyrics.shown).toBe(false)
  })
})
