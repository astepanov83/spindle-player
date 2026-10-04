// The files pages as the chips and sidebar read them: in a $derived, which
// runs again only for what the page itself is built from.
import { flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryData } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'
import { library } from '../../stores/library.svelte'
import { files } from './store.svelte'
import type { SongsBlock } from '../types'
import { filesPage } from './page'

// radio's page half hears main from the start; before the imports load it
vi.hoisted(() =>
  vi.stubGlobal('window', {
    radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
  })
)

function lib(): LibraryData {
  const track = (id: string): LibraryData['tracks'][number] => ({
    id,
    title: id,
    duration: 1,
    albumId: 'a',
    artist: 'X',
    album: 'A',
    no: 1,
    disc: 1,
    codec: '',
    folder: 0
  })
  return {
    albums: [
      {
        id: 'a',
        title: 'A',
        artist: 'X',
        year: 0,
        palette: defaultPalettes,
        cover: '',
        coverLarge: '',
        trackIds: ['s1', 's2']
      }
    ],
    tracks: [track('s1'), track('s2')],
    folders: [{ name: '/m', parent: -1 }]
  }
}

describe("Classic's Songs", () => {
  it('a sort click sorts, and does not build the list of songs again', () => {
    files.load(lib())
    let builds = 0
    let block: SongsBlock | undefined
    const stop = $effect.root(() => {
      const blocks = $derived.by(() => {
        builds++
        return filesPage('songs', '', '')
      })
      $effect(() => {
        block = blocks[0] as SongsBlock
      })
    })
    flushSync()
    expect(builds).toBe(1)
    library.sort = { k: 't', dir: -1 }
    flushSync()
    expect(builds).toBe(1)
    expect(block?.sort).toEqual({ k: 't', dir: -1 })
    // new songs do
    files.load(lib())
    flushSync()
    expect(builds).toBe(2)
    stop()
  })
})
