// Songs of a music folder the last scan did not find (a drive not mounted).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData, ScanStatus, Track } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'

let files: typeof import('./store.svelte').files
let rootsOf: typeof import('./store.svelte').rootsOf
let tracks: typeof import('./tracks')

const album = (id: string, trackIds: string[]): Album => ({
  id,
  title: id,
  artist: 'Marina Vale',
  year: 0,
  added: 0,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds
})

const track = (id: string, folder: number): Track => ({
  id,
  title: id,
  duration: 1,
  albumId: id,
  artist: 'Marina Vale',
  album: id,
  no: 1,
  disc: 1,
  codec: '',
  folder
})

// /nas/Music/Rock holds "far", /home/m holds "near"
const lib: LibraryData = {
  albums: [album('far', ['far']), album('near', ['near'])],
  tracks: [track('far', 1), track('near', 2)],
  folders: [
    { name: '/nas/Music', parent: -1 },
    { name: 'Rock', parent: 0 },
    { name: '/home/m', parent: -1 }
  ]
}

const status = (missing: string[]): ScanStatus => ({
  folders: ['/nas/Music', '/home/m'],
  phase: 'idle',
  done: 0,
  total: 0,
  tracks: 2,
  albums: 2,
  failed: 0,
  missing
})

const why = (id: string): string | undefined => {
  const s = tracks.trackState(id, () => true)
  return s.state === 'ok' ? s.info.unavailable : 'not ok'
}

beforeEach(async () => {
  vi.resetModules()
  ;({ files, rootsOf } = await import('./store.svelte'))
  tracks = await import('./tracks')
  files.load(lib)
})

describe('songs whose music folder was not found', () => {
  it('say so, by the folder’s own name, and the others play', () => {
    files.status = status(['/nas/Music'])
    expect(why('far')).toBe('Folder not found: Music')
    expect(why('near')).toBe(undefined)
  })

  it('play again once a scan finds the folder', () => {
    files.status = status(['/nas/Music'])
    files.status = status([])
    expect(why('far')).toBe(undefined)
  })

  it('bump the revision when the list of missing folders changes, not on every status', () => {
    const r = files.revision
    files.status = status([])
    expect(files.revision).toBe(r)
    files.status = status(['/nas/Music'])
    expect(files.revision).toBe(r + 1)
    files.status = status(['/nas/Music'])
    expect(files.revision).toBe(r + 1)
  })

  it('find each folder’s music folder, whatever the order of the table', () => {
    expect(rootsOf(lib.folders!)).toEqual(['/nas/Music', '/nas/Music', '/home/m'])
    expect(
      rootsOf([
        { name: 'Live', parent: 2 },
        { name: '/m', parent: -1 },
        { name: 'Rock', parent: 1 }
      ])
    ).toEqual(['/m', '/m', '/m'])
  })
})

describe('a song’s info', () => {
  it('has its album’s artist, for the play log', () => {
    const s = tracks.trackState('far', () => true)
    expect(s.state === 'ok' && s.info.groupArtist).toBe('Marina Vale')
  })
})

describe('a song’s genre and year (ticket 122)', () => {
  const info = (id: string): { genre?: string; year?: number } | undefined => {
    const s = tracks.trackState(id, () => true)
    return s.state === 'ok' ? { genre: s.info.genre, year: s.info.year } : undefined
  }

  it('has its genres as one line, and its own year or its album’s', () => {
    files.load({
      ...lib,
      albums: [{ ...album('far', ['far', 'own']), year: 2005 }, album('near', ['near'])],
      tracks: [
        { ...track('far', 1), genre: ['Rock', 'Metal'] },
        { ...track('own', 1), albumId: 'far', year: 1983 },
        track('near', 2)
      ]
    })
    expect(info('far')).toEqual({ genre: 'Rock, Metal', year: 2005 })
    expect(info('own')).toEqual({ genre: undefined, year: 1983 })
    // no year anywhere
    expect(info('near')).toEqual({ genre: undefined, year: undefined })
  })
})
