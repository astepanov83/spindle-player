import { describe, expect, it } from 'vitest'
import { emptyQueues } from '../shared/saved-queue'
import { convertPlaylists, convertQueue, isOldPlaylistsFile, isOldQueueFile } from './convert-files'
import { oldIdsFrom } from './plugins/old-ids'

const mfp = oldIdsFrom({ tracks: new Set(['m1', 'm2']), albums: new Set(['ep']) })
const none = oldIdsFrom({ tracks: new Set(), albums: new Set() })

describe('convertQueue', () => {
  it("gives MFP's ids to mfp and the rest to files, in order", () => {
    const q = convertQueue({ items: ['t1', 'm1', 't2', 'm2'], index: 2, from: 'X', pos: 3 }, mfp)
    expect(q).toEqual({
      ...emptyQueues(),
      track: { items: ['files:t1', 'mfp:m1', 'files:t2', 'mfp:m2'], index: 2, from: 'X', pos: 3 }
    })
    expect(convertQueue({ items: ['m1'] }, none).track.items).toEqual(['files:m1'])
  })

  it('turns radio playing into the live item, with or without songs', () => {
    const live = { live: { current: 'radio:metal-only' }, active: 'live' }
    expect(convertQueue({ items: [], kind: 'radio', station: 'metal-only' }, mfp)).toEqual({
      ...emptyQueues(),
      ...live
    })
    expect(convertQueue({ kind: 'radio', station: 'metal-only' }, mfp)).toMatchObject(live)
    const q = convertQueue({ items: ['t1'], index: 0, pos: 8, kind: 'radio', station: 'rb-1' }, mfp)
    expect(q.track.items).toEqual(['files:t1'])
    expect(q.track.pos).toBe(8)
    expect(q.live.current).toBe('radio:rb-1')
    // a bad station leaves the track queue playing
    for (const station of [undefined, 'a/b', 3])
      expect(convertQueue({ items: ['t1'], kind: 'radio', station }, mfp).active).toBe('track')
  })

  it('turns each "From" link into a plugin page', () => {
    const link = (kind: string, id: string): unknown =>
      convertQueue({ items: ['t1'], link: { kind, id } }, mfp).track.link
    expect(link('album', 'al1')).toEqual({ plugin: 'files', page: 'album/al1' })
    expect(link('album', 'ep')).toEqual({ plugin: 'mfp', page: 'episode/ep' })
    expect(link('artist', 'marinavale')).toEqual({ plugin: 'files', page: 'artist/marinavale' })
    expect(link('folder', '/music/a')).toEqual({ plugin: 'files', page: 'folder//music/a' })
    expect(link('playlist', 'p1')).toEqual({ plugin: 'core', page: 'playlist/p1' })
    for (const bad of [link('song', 'x'), link('album', '')]) expect(bad).toBeUndefined()
  })

  it('keeps Play next songs and pulls a bad place into range, as before', () => {
    const q = convertQueue({ items: ['t1', 't2', 't3'], index: 9, pos: -1, next: 4 }, mfp)
    expect(q.track).toEqual({
      items: ['files:t1', 'files:t2', 'files:t3'],
      index: 2,
      from: '',
      pos: 0
    })
    const n = convertQueue({ items: ['t1', 't2', 't3'], index: 0, pos: 0, next: 2 }, mfp)
    expect(n.track.next).toBe(2)
  })

  it('drops ids that are not strings, and gives an empty queue for a wrong list', () => {
    expect(convertQueue({ items: ['t1', 3, '', null] }, mfp).track.items).toEqual(['files:t1'])
    for (const items of [undefined, 'a', {}])
      expect(convertQueue({ items }, mfp)).toEqual(emptyQueues())
  })

  it('knows an old file by its missing version', () => {
    expect(isOldQueueFile({ items: [] })).toBe(true)
    expect(isOldQueueFile({})).toBe(true)
    for (const raw of [emptyQueues(), { version: 3 }, [], null, 'x'])
      expect(isOldQueueFile(raw)).toBe(false)
  })
})

describe('convertPlaylists', () => {
  it('turns track ids into keys, the same way as the queue', () => {
    const raw = {
      version: 1,
      playlists: [
        { id: 'a', name: 'Mix', trackIds: ['t1', 'm1', 7, '', 't1'] },
        { id: 'b', name: 'Empty' },
        { id: 'a', name: 'Same id', trackIds: [] },
        'junk'
      ]
    }
    expect(convertPlaylists(raw, mfp)).toEqual([
      { id: 'a', name: 'Mix', items: ['files:t1', 'mfp:m1'] },
      { id: 'b', name: 'Empty', items: [] }
    ])
    expect(convertPlaylists({ playlists: 'x' }, mfp)).toEqual([])
  })

  it('knows an old file: version 1 or none', () => {
    expect(isOldPlaylistsFile({ version: 1, playlists: [] })).toBe(true)
    expect(isOldPlaylistsFile({ playlists: [] })).toBe(true)
    for (const raw of [{ version: 2, playlists: [] }, { version: 3 }, [], null])
      expect(isOldPlaylistsFile(raw)).toBe(false)
  })
})
