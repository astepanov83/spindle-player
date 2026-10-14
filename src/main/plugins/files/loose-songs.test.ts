import { describe, expect, it } from 'vitest'
import { buildLibrary, shortHash } from './group'
import { cueTrackId } from '../../ids'
import { parseCue } from './cue'
import { openLoose, type LooseLibrary, type LooseReads } from './loose-songs'
import type { CueEntry, FileEntry, FolderImage } from './types'

const entry = (path: string, more: Partial<FileEntry> = {}): FileEntry => ({
  path,
  mtime: 1,
  size: 1,
  duration: 300,
  ...more
})

const sheet = parseCue(
  [
    'PERFORMER "Marina Vale"',
    'TITLE "Live"',
    'FILE "Live.flac" WAVE',
    '  TRACK 01 AUDIO',
    '    TITLE "Open"',
    '    INDEX 01 00:00:00',
    '  TRACK 02 AUDIO',
    '    TITLE "Close"',
    '    INDEX 01 02:00:00'
  ].join('\n')
)!

// a made-up disk: files with their tags, folders with their names
function disk(o: {
  files?: Record<string, Partial<FileEntry>>
  cues?: Record<string, CueEntry['sheet']>
  images?: Record<string, string>
}): LooseReads & { reads: string[]; waited: string[] } {
  const files = o.files ?? {}
  const cues = o.cues ?? {}
  const images = o.images ?? {}
  const all = [...Object.keys(files), ...Object.keys(cues), ...Object.keys(images)]
  const r = {
    reads: [] as string[],
    waited: [] as string[],
    stat: async (p: string) => (all.includes(p) ? { mtime: 5, size: 9, isFile: true } : undefined),
    readFile: async (p: string, mtime: number, size: number) => {
      r.reads.push(p)
      return { ...entry(p), mtime, size, ...files[p] }
    },
    readCue: async (f: { path: string; mtime: number; size: number }): Promise<CueEntry> => ({
      ...f,
      sheet: cues[f.path]
    }),
    list: async (dir: string) =>
      all
        .filter((p) => p.startsWith(dir + '/') && !p.slice(dir.length + 1).includes('/'))
        .map((p) => p.slice(dir.length + 1)),
    readImage: async (_dir: string, path: string): Promise<FolderImage | undefined> =>
      images[path] ? { path, mtime: 1, size: 1, cover: images[path] } : undefined,
    coverMade: async (h: string) => void r.waited.push(h)
  }
  return r
}

function library(files: FileEntry[] = [], cues: CueEntry[] = []): LooseLibrary {
  const ix = new Map(files.map((e) => [e.path, e]))
  const cx = new Map(cues.map((c) => [c.path, c]))
  const built = buildLibrary(
    {
      version: 1,
      reader: 4,
      files: ix,
      cues: cx,
      images: new Map(),
      palettes: new Map(),
      stalePalettes: new Map(),
      pendingMoves: {}
    },
    () => true
  )
  const ids = new Set(built.data.tracks.map((t) => t.id))
  return {
    files: ix,
    cues: cx,
    images: new Map(),
    palettes: new Map(),
    hasTrack: (id) => ids.has(id),
    build: (x) => buildLibrary(x, () => true)
  }
}

describe('openLoose', () => {
  it('gives a file in the library as its library song, without reading it', async () => {
    const d = disk({ files: { '/lib/a.mp3': {} } })
    const r = await openLoose(['/lib/a.mp3'], library([entry('/lib/a.mp3')]), d)
    expect(r.items).toEqual([[shortHash('/lib/a.mp3')]])
    expect(r.songs).toEqual([])
    expect(d.reads).toEqual([])
  })

  it('reads a file outside the library into a song keyed by its path', async () => {
    const d = disk({
      files: {
        '/x/Song.flac': { title: 'Song', artist: 'Amber Fields', album: 'Far', cover: 'c1' }
      }
    })
    const r = await openLoose(['/x/Song.flac'], library(), d)
    expect(r.items).toEqual([['/x/Song.flac']])
    const [s] = r.songs
    expect(s.track).toMatchObject({
      id: '/x/Song.flac',
      title: 'Song',
      artist: 'Amber Fields',
      album: 'Far',
      folder: -1
    })
    expect(s.track.art?.cover).toContain('c1')
    expect(s.file).toBe(shortHash('/x/Song.flac'))
    expect(r.media.get(s.file)?.path).toBe('/x/Song.flac')
    expect(r.words.get('/x/Song.flac')).toEqual({ path: '/x/Song.flac' })
    // the cover is made before the song is sent
    expect(d.waited).toEqual(['c1'])
  })

  it("takes the folder's cover image", async () => {
    const d = disk({ files: { '/x/a.mp3': {} }, images: { '/x/cover.jpg': 'img1' } })
    const r = await openLoose(['/x/a.mp3'], library(), d)
    expect(r.songs[0].track.art?.cover).toContain('img1')
  })

  it('gives nothing for a file that is gone or not a song', async () => {
    const d = disk({ files: { '/x/notes.txt': {} } })
    const r = await openLoose(
      ['/x/gone.mp3', '/x/notes.txt', 'rel.mp3', '/x/a.mp3#2'],
      library(),
      d
    )
    expect(r.items).toEqual([undefined, undefined, undefined, undefined])
    expect(r.songs).toEqual([])
  })

  it("gives a cue sheet's tracks in order, keyed by the sheet", async () => {
    const d = disk({ files: { '/x/Live.flac': {} }, cues: { '/x/Live.cue': sheet } })
    const r = await openLoose(['/x/Live.cue'], library(), d)
    expect(r.items).toEqual([['/x/Live.cue#1', '/x/Live.cue#2']])
    expect(r.songs.map((s) => [s.track.title, s.track.artist, s.track.part])).toEqual([
      ['Open', 'Marina Vale', { file: shortHash('/x/Live.flac'), start: 0, end: 120 }],
      ['Close', 'Marina Vale', { file: shortHash('/x/Live.flac'), start: 120 }]
    ])
    expect(r.songs[0].file).toBe(shortHash('/x/Live.flac'))
    expect(r.media.get(shortHash('/x/Live.flac'))?.path).toBe('/x/Live.flac')
    expect(r.words.get('/x/Live.cue#2')).toEqual({
      path: '/x/Live.flac',
      cue: { no: 2, title: 'Close' }
    })
  })

  it("gives one track of a cue sheet for its loose id (a saved queue's)", async () => {
    const d = disk({ files: { '/x/Live.flac': {} }, cues: { '/x/Live.cue': sheet } })
    const r = await openLoose(['/x/Live.cue#2', '/x/Live.cue#9'], library(), d)
    expect(r.items).toEqual([['/x/Live.cue#2'], undefined])
    expect(r.songs.map((s) => s.track.title)).toEqual(['Close'])
  })

  it("gives a library cue sheet's tracks as library songs", async () => {
    const image = entry('/lib/Live.flac')
    const cue: CueEntry = { path: '/lib/Live.cue', mtime: 1, size: 1, sheet }
    const d = disk({ files: { '/lib/Live.flac': {} }, cues: { '/lib/Live.cue': sheet } })
    const r = await openLoose(['/lib/Live.cue'], library([image], [cue]), d)
    expect(r.items).toEqual([[cueTrackId('/lib/Live.flac', 1), cueTrackId('/lib/Live.flac', 2)]])
    expect(r.songs).toEqual([])
    expect(d.reads).toEqual([])
  })

  it('keeps a loose id loose when its file is in the library now', async () => {
    const d = disk({ files: { '/lib/a.mp3': {} } })
    const r = await openLoose(['/lib/a.mp3'], library([entry('/lib/a.mp3')]), d, true)
    expect(r.items).toEqual([['/lib/a.mp3']])
    expect(r.songs.map((s) => s.track.id)).toEqual(['/lib/a.mp3'])
    // what the index read is enough
    expect(d.reads).toEqual([])
  })

  it('gives nothing for a cue sheet whose file is missing', async () => {
    const d = disk({ cues: { '/x/Live.cue': sheet } })
    expect((await openLoose(['/x/Live.cue'], library(), d)).items).toEqual([undefined])
  })

  it('keeps the order asked, mixing library and other songs', async () => {
    const d = disk({ files: { '/x/b.mp3': {}, '/lib/a.mp3': {} } })
    const r = await openLoose(['/x/b.mp3', '/lib/a.mp3'], library([entry('/lib/a.mp3')]), d)
    expect(r.items).toEqual([['/x/b.mp3'], [shortHash('/lib/a.mp3')]])
  })
})
