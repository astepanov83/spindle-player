// What a patch makes the page redo: a .svelte test, so $derived runs as in
// the app. The song lists sort 50k rows, so a patch with only photos must
// not make them run again.
import { flushSync } from 'svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import type { LibraryData, Track } from '../../../shared/library'
import type { LibraryPatch } from '../../../shared/plugins/files/library-patch'
import { defaultPalettes } from '../../../shared/palette'
import { files } from '../plugins/files/store.svelte'

const song = (id: string): Track => ({
  id,
  title: id,
  duration: 1,
  albumId: 'a',
  artist: 'X',
  album: 'a',
  no: 1,
  disc: 1,
  codec: '',
  folder: 0
})

const data: LibraryData = {
  albums: [
    {
      id: 'a',
      title: 'A',
      artist: 'X',
      year: 0,
      added: 0,
      palette: defaultPalettes,
      cover: '',
      coverLarge: '',
      trackIds: ['a1']
    }
  ],
  tracks: [song('a1')],
  folders: []
}

const patch = (more: Partial<LibraryPatch>): LibraryPatch => ({
  patch: true,
  epoch: 'e',
  from: 0,
  n: 1,
  albums: [],
  tracks: [],
  goneTracks: [],
  ...more
})

beforeEach(() => {
  files.load({ ...data, epoch: 'e', n: 0 })
})

// counts how often a $derived that looks up a song runs, as the song lists do
function watchSongs(): { runs: () => number; stop: () => void } {
  let runs = 0
  const stop = $effect.root(() => {
    const rows = $derived.by(() => {
      runs++
      return files.order(files.track('a1'))
    })
    $effect(() => void rows)
  })
  flushSync()
  return { runs: () => runs, stop }
}

describe('library versions', () => {
  it('does not redo the song lists for a patch with only photos', () => {
    const w = watchSongs()
    expect(w.runs()).toBe(1)
    const before = files.revision
    files.patch(
      patch({
        photos: { x: { cover: 'spindle://cover/small/x', coverLarge: 'spindle://cover/large/x' } }
      })
    )
    flushSync()
    expect(w.runs()).toBe(1)
    // a photo that failed to show still tries again
    expect(files.revision).toBe(before + 1)
    w.stop()
  })

  it('does not redo them, or the artists, for albums with only new curves', () => {
    const w = watchSongs()
    const artists = files.artists
    const before = files.revision
    const curves = ['A'.repeat(32)]
    files.patch(patch({ albums: [{ ...data.albums[0], loudness: curves }] }))
    flushSync()
    expect(w.runs()).toBe(1)
    expect(files.artists).toBe(artists)
    // the pictures see the curves
    expect(files.album('a').loudness).toEqual(curves)
    expect(files.revision).toBe(before + 1)
    expect(files.sent).toEqual({ epoch: 'e', n: 1 })
    w.stop()
  })

  it('redoes them when an album changed besides its curves', () => {
    const w = watchSongs()
    files.patch(patch({ albums: [{ ...data.albums[0], title: 'B', loudness: ['A'.repeat(32)] }] }))
    flushSync()
    expect(w.runs()).toBe(2)
    expect(files.album('a').title).toBe('B')
    w.stop()
  })

  it('redoes them when songs changed', () => {
    const w = watchSongs()
    files.patch(patch({ tracks: [{ ...song('a1'), title: 'Renamed' }] }))
    flushSync()
    expect(w.runs()).toBe(2)
    w.stop()
  })
})
