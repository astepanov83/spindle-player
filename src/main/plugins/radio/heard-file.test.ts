import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPalettes } from '../../../shared/palette'
import { heardSong, type HeardSong } from '../../../shared/plugins/radio/heard'
import { HeardStore } from './heard-file'

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-heard-'))
  path = join(dir, 'heard.json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const station = { id: 'metal-only', name: 'Metal Only' }
const song = (raw: string, at: number): HeardSong => heardSong(raw, station, at)!
const art = { hash: 'c'.repeat(40), palette: defaultPalettes }
const onDisk = (): unknown => JSON.parse(readFileSync(path, 'utf8'))
const titles = (list: HeardSong[]): string[] => list.map((s) => s.raw)

describe('HeardStore', () => {
  it('starts empty with no file, and writes none until a song is saved', () => {
    const s = new HeardStore(path)
    expect(s.list()).toEqual([])
    s.flushSync()
    expect(existsSync(path)).toBe(false)
  })

  it('saves a song and reads it back after a restart', () => {
    const s = new HeardStore(path)
    s.save(song('Dio - Holy Diver', 100))
    s.flushSync()
    expect(onDisk()).toEqual({
      version: 1,
      songs: [
        {
          raw: 'Dio - Holy Diver',
          artist: 'Dio',
          song: 'Holy Diver',
          station: 'Metal Only',
          stationId: 'metal-only',
          at: 100
        }
      ]
    })
    expect(titles(new HeardStore(path).list())).toEqual(['Dio - Holy Diver'])
  })

  it('removes a song and puts it back with Undo, in its place', () => {
    const s = new HeardStore(path)
    s.save(song('A - One', 1))
    s.save(song('B - Two', 2))
    s.save(song('C - Three', 3))
    expect(titles(s.remove('b - two'))).toEqual(['A - One', 'C - Three'])
    expect(titles(s.restore('B - Two'))).toEqual(['A - One', 'B - Two', 'C - Three'])
    // only once
    s.remove('B - Two')
    s.restore('B - Two')
    expect(titles(s.restore('B - Two'))).toEqual(['A - One', 'B - Two', 'C - Three'])
    s.flushSync()
    expect((onDisk() as { songs: unknown[] }).songs).toHaveLength(3)
  })

  it('restores nothing that was not removed, and nothing saved again meanwhile', () => {
    const s = new HeardStore(path)
    s.save(song('A - One', 1))
    expect(titles(s.restore('Z - Never'))).toEqual(['A - One'])
    s.remove('A - One')
    s.save(song('A - One', 9))
    expect(s.restore('A - One').map((x) => x.at)).toEqual([9])
    expect(s.remove(42)).toBe(s.list())
  })

  it('takes a cover found later, and lists it for the prune', () => {
    const s = new HeardStore(path)
    s.save(song('A - One', 1))
    expect(s.setCover('A - One', art)).toBe(true)
    expect(s.setCover('A - One', art)).toBe(false)
    expect(s.setCover('B - Two', art)).toBe(false)
    expect(s.hashes()).toEqual([art.hash])
  })

  it('keeps an unknown file aside and a bad entry dropped alone', () => {
    writeFileSync(path, JSON.stringify({ version: 2, songs: [] }))
    new HeardStore(path).save(song('A - One', 1))
    expect(existsSync(path + '.unknown')).toBe(true)

    writeFileSync(
      path,
      JSON.stringify({ version: 1, songs: [{ raw: 'A - One', stationId: 'x', at: 1 }, { at: 2 }] })
    )
    expect(titles(new HeardStore(path).list())).toEqual(['A - One'])
  })

  it('keeps a broken file aside and starts empty', () => {
    writeFileSync(path, '{ not json')
    const s = new HeardStore(path)
    expect(s.list()).toEqual([])
    expect(readFileSync(path + '.broken', 'utf8')).toBe('{ not json')
  })
})
