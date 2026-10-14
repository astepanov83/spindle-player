// tag-fixes.json: kept by the library process (ticket 129).
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileTagsOf, fixEntry, TagFixesStore, tagValuesOf } from './tag-fixes-file'
import type { FileEntry } from './types'
import type { TagValues } from '../../../shared/plugins/files/tag-fixes'

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-tag-fixes-'))
  path = join(dir, 'tag-fixes.json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const read = (): unknown => JSON.parse(readFileSync(path, 'utf8'))

const entry: FileEntry = {
  path: '/m/a.flac',
  mtime: 1,
  size: 1,
  duration: 60,
  title: 'Lucid',
  artist: 'Kai',
  album: 'Blue Hours',
  year: 1995,
  genre: ['Ambient'],
  track: 1
}
const fileOf = (id: string): TagValues | undefined =>
  id === 'gone' ? undefined : tagValuesOf(entry)

describe('TagFixesStore', () => {
  it('keeps a change and reads it back after a restart', () => {
    const store = new TagFixesStore(path)
    const before = store.change(
      { edit: { ids: ['a'], set: { year: 1996, genre: ['Doom metal'] }, reset: [] } },
      fileOf
    )
    expect(before).toEqual({ a: null })
    expect(store.flushSync()).toBe(true)
    expect(read()).toEqual({
      version: 1,
      fixes: { 'files:a': { year: 1996, genre: ['Doom metal'] } }
    })
    expect([...new TagFixesStore(path).fixes]).toEqual([
      ['a', { year: 1996, genre: ['Doom metal'] }]
    ])
  })

  it('writes nothing for a change that changes nothing', () => {
    const store = new TagFixesStore(path)
    expect(
      store.change({ edit: { ids: ['a'], set: { year: 1995 }, reset: [] } }, fileOf)
    ).toBeUndefined()
    store.flushSync()
    expect(readdirSync(dir)).toEqual([])
  })

  it('keeps a copy of a broken file or one of another version before it is written', () => {
    writeFileSync(path, '{ not json')
    expect(new TagFixesStore(path).fixes.size).toBe(0)
    expect(readFileSync(path + '.broken', 'utf8')).toBe('{ not json')
    writeFileSync(path, JSON.stringify({ version: 2, fixes: { 'files:a': { year: 1 } } }))
    // what reads as fixes is still used, as for loved.json
    expect([...new TagFixesStore(path).fixes]).toEqual([['a', { year: 1 }]])
    expect(readdirSync(dir).sort()).toEqual([
      'tag-fixes.json',
      'tag-fixes.json.broken',
      'tag-fixes.json.unknown'
    ])
  })

  it('drops a bad entry alone', () => {
    writeFileSync(
      path,
      JSON.stringify({ version: 1, fixes: { 'files:a': { year: 'x' }, 'files:b': { year: 2001 } } })
    )
    expect([...new TagFixesStore(path).fixes]).toEqual([['b', { year: 2001 }]])
  })

  it('moves fixes with their songs and prunes songs gone', () => {
    const store = new TagFixesStore(path)
    store.change({ put: { a: { year: 2001 }, gone: { year: 1 } } }, fileOf)
    expect(store.moveIds({ a: 'a2' })).toBe(true)
    expect(store.moveIds({ x: 'y' })).toBe(false)
    expect(store.prune((id) => (id === 'a2' ? tagValuesOf(entry) : undefined))).toBe(true)
    store.flushSync()
    expect(read()).toEqual({ version: 1, fixes: { 'files:a2': { year: 2001 } } })
  })
})

describe('applying a fix to an entry', () => {
  it('changes the fields it has; an empty value takes the tag away', () => {
    const e = fixEntry(entry, { album: 'Blue Hours II', year: 0, genre: [], no: 4, title: '' })
    expect(e).toEqual({
      path: '/m/a.flac',
      mtime: 1,
      size: 1,
      duration: 60,
      artist: 'Kai',
      album: 'Blue Hours II',
      track: 4
    })
    // the entry read is not changed
    expect(entry.year).toBe(1995)
  })

  it("gives the file's own values of the fields fixed", () => {
    expect(fileTagsOf(entry, { year: 1996, albumArtist: 'Kai', disc: 2 })).toEqual({
      year: 1995,
      albumArtist: '',
      disc: 0
    })
  })
})
