// Where a link from what plays lands (ticket 040): the top, or the song's
// row, also over a kept place. Apart from scroll-top.svelte.test.ts, which
// loads fresh modules each test: the effect must share this file's Svelte.
import { flushSync } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueLink } from '../../../shared/saved-queue'
import type { LibraryData } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import { library } from '../stores/library.svelte'
import { files } from '../plugins/files/store.svelte'
import { openPage } from '../plugins'
import { libraryView, scrollTopOnChange } from './scroll-top.svelte'

// radio's page half hears main from the start; before the imports load it
vi.hoisted(() =>
  vi.stubGlobal('window', {
    radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
  })
)

// a link to album "a", at a song
const showAlbum = (song?: string): void =>
  openPage({ plugin: 'files', page: 'album/a', ...(song ? { item: song } : {}) })

describe('where a link lands (ticket 040)', () => {
  let frames: (() => void)[] = []

  // A scroll box 100px tall over 1000px of page, with one song row 20px tall
  // at y 500 of the page.
  function makeBox(): HTMLElement {
    const el = {
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 100,
      getBoundingClientRect: () => ({ top: 0, bottom: 100, height: 100 }),
      querySelectorAll: () => [],
      querySelector: (q: string) =>
        q === '[data-song="a1"]'
          ? { getBoundingClientRect: () => ({ top: 500 - el.scrollTop, height: 20 }) }
          : null,
      addEventListener: () => {},
      removeEventListener: () => {}
    }
    return el as unknown as HTMLElement
  }

  // lets the scroll run to its end: a tick, then a frame at a time
  async function settle(): Promise<void> {
    for (let i = 0; i < 80; i++) {
      await Promise.resolve()
      const run = frames
      frames = []
      run.forEach((f) => f())
    }
  }

  const album: LibraryData = {
    albums: [
      {
        id: 'a',
        title: 'A',
        artist: 'X',
        year: 0,
        palette: defaultPalettes,
        cover: '',
        coverLarge: '',
        trackIds: ['a1']
      }
    ],
    tracks: [
      {
        id: 'a1',
        title: 'a1',
        duration: 1,
        albumId: 'a',
        artist: 'X',
        album: 'A',
        no: 1,
        disc: 1,
        codec: '',
        folder: 0
      }
    ],
    folders: []
  }

  let box: HTMLElement | undefined = $state.raw()
  let cleanup = (): void => {}

  beforeEach(async () => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('CSS', { escape: (s: string) => s })
    files.load(album)
    box = makeBox()
    cleanup()
    cleanup = $effect.root(() =>
      scrollTopOnChange(
        () => box,
        () => libraryView()
      )
    )
    flushSync()
    await settle()
  })

  it('scrolls the song row to the middle once, then leaves the page alone', async () => {
    showAlbum('a1')
    flushSync()
    await settle()
    // row middle at 510, box middle at 50
    expect(box!.scrollTop).toBe(460)
    expect(library.landing).toBeNull()
    box!.scrollTop = 700
    flushSync()
    await settle()
    expect(box!.scrollTop).toBe(700)
  })

  it('starts at the top when the page linked to is already open', async () => {
    showAlbum()
    flushSync()
    await settle()
    box!.scrollTop = 300
    openPage({ plugin: 'files', page: queueLink('album', 'a').page })
    flushSync()
    await settle()
    expect(box!.scrollTop).toBe(0)
  })

  it('starts at the top when the link closes a search over that page', async () => {
    showAlbum()
    flushSync()
    await settle()
    box!.scrollTop = 300
    library.query = 'x'
    flushSync()
    await settle()
    // going up from the results would show the album where it was left
    showAlbum()
    flushSync()
    await settle()
    expect(box!.scrollTop).toBe(0)
  })

  it('keeps the row until the box is there', async () => {
    box = undefined
    flushSync()
    showAlbum('a1')
    flushSync()
    await settle()
    expect(library.landing).toEqual({ song: 'a1' })
    box = makeBox()
    flushSync()
    await settle()
    expect(box.scrollTop).toBe(460)
    expect(library.landing).toBeNull()
  })
})
