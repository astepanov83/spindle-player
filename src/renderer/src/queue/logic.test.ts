import { describe, expect, it } from 'vitest'
import type { Track } from '../../../shared/library'
import {
  advance,
  afterFailure,
  append,
  clearQueue,
  failNotice,
  back,
  follows,
  insertNext,
  jump,
  moveRow,
  onEnded,
  prune,
  queueNotice,
  removeRow,
  type QueueState
} from './logic'

const q = (index: number, items = ['a/0', 'a/1', 'a/2']): QueueState => ({
  items,
  index,
  from: 'A'
})
const nextAlbum = (last: string): string[] => (last.startsWith('a/') ? ['b/0', 'b/1'] : [])

describe('advance', () => {
  it('goes to the next song', () => {
    expect(advance(q(0), { shuffle: false, nextAlbum }).index).toBe(1)
  })

  it('carries on with the next album when the queue runs out', () => {
    const s = advance(q(2), { shuffle: false, nextAlbum })
    expect(s.items).toEqual(['a/0', 'a/1', 'a/2', 'b/0', 'b/1'])
    expect(s.index).toBe(3)
    expect(s.from).toBe('A')
  })

  it('stays put when there is nothing after', () => {
    const s = q(1, ['x/0', 'x/1'])
    expect(advance(s, { shuffle: false, nextAlbum })).toBe(s)
  })

  it('shuffle picks another song, never the current one', () => {
    for (const r of [0, 0.2, 0.5, 0.99]) {
      const s = advance(q(1), { shuffle: true, nextAlbum, random: () => r })
      expect(s.index).not.toBe(1)
      expect(s.index).toBeGreaterThanOrEqual(0)
      expect(s.index).toBeLessThan(3)
    }
  })

  it('shuffle with one song acts like next', () => {
    const s = advance(q(0, ['a/0']), { shuffle: true, nextAlbum: () => ['b/0'] })
    expect(s.index).toBe(1)
  })
})

describe('advance while skipping failed songs', () => {
  // one album in the library: the next album is always the same one
  const same = (): string[] => ['a/0', 'a/1', 'a/2']

  it('does not add an album that is already in the queue', () => {
    const s = q(2)
    expect(advance(s, { shuffle: false, nextAlbum: same, noRepeats: true })).toBe(s)
  })

  it('still adds a new album', () => {
    const s = advance(q(2), { shuffle: false, nextAlbum, noRepeats: true })
    expect(s.items).toEqual(['a/0', 'a/1', 'a/2', 'b/0', 'b/1'])
  })
})

describe('back', () => {
  it('restarts after 3 seconds', () => {
    expect(back(q(1), 3.5)).toEqual({ state: q(1), restart: true })
  })
  it('goes one back early in the song', () => {
    expect(back(q(1), 2).state.index).toBe(0)
  })
  it('restarts the first song', () => {
    expect(back(q(0), 0).restart).toBe(true)
  })
})

describe('prune', () => {
  const has = (gone: string[]) => (id: string) => !gone.includes(id)

  it('keeps the queue as it is when nothing is gone', () => {
    const s = q(1)
    expect(prune(s, has([]))).toBe(s)
  })

  it('keeps the current song current when others go', () => {
    expect(prune(q(2), has(['a/0']))).toEqual({ items: ['a/1', 'a/2'], index: 1, from: 'A' })
  })

  it('moves to the next song left when the current one is gone', () => {
    expect(prune(q(1), has(['a/1']))).toEqual({ items: ['a/0', 'a/2'], index: 1, from: 'A' })
  })

  it('moves to the last song when the current one and all after it are gone', () => {
    expect(prune(q(1), has(['a/1', 'a/2']))).toEqual({ items: ['a/0'], index: 0, from: 'A' })
  })

  it('empties the queue when every song is gone', () => {
    expect(prune(q(1), () => false)).toEqual({ items: [], index: 0, from: 'A' })
  })
})

describe('onEnded', () => {
  it('replays the song with repeat on', () => {
    expect(onEnded(q(1), true, { shuffle: false, nextAlbum })).toEqual({ kind: 'replay' })
  })

  it('plays the next song', () => {
    const r = onEnded(q(0), false, { shuffle: false, nextAlbum })
    expect(r).toEqual({ kind: 'play', state: q(1) })
  })

  it('carries on with the next album at the end of the list', () => {
    const r = onEnded(q(2), false, { shuffle: false, nextAlbum })
    expect(r.kind === 'play' && r.state.items[r.state.index]).toBe('b/0')
  })

  it('stops when there is nothing to carry on with', () => {
    expect(onEnded(q(1, ['x/0', 'x/1']), false, { shuffle: false, nextAlbum })).toEqual({
      kind: 'stop'
    })
  })

  it('shuffle picks another song from the list', () => {
    const r = onEnded(q(0), false, { shuffle: true, nextAlbum, random: () => 0.99 })
    expect(r).toEqual({ kind: 'play', state: q(2) })
  })
})

describe('jump', () => {
  it('moves to the clicked row', () => {
    expect(jump(q(0), 2)).toEqual(q(2))
  })
  it('ignores rows out of range', () => {
    const s = q(1)
    expect(jump(s, 5)).toBe(s)
    expect(jump(s, -1)).toBe(s)
  })
})

describe('failNotice', () => {
  it('tells a file that is gone from a format, with the title last', () => {
    expect(failNotice('Song', true, 'paused')).toBe('File is gone or can\'t be read: "Song"')
    expect(failNotice('Song', false, 'skipped')).toBe('Format can\'t be played, skipped: "Song"')
    expect(failNotice('Song', true, 'end')).toBe(
      'File is gone or can\'t be read, stopped at the end of the list: "Song"'
    )
  })
})

describe('afterFailure', () => {
  it('skips a song that fails', () => {
    expect(afterFailure(1, 10)).toBe('skip')
  })
  it('stops after the cap', () => {
    expect(afterFailure(20, 500)).toBe('stop')
    expect(afterFailure(19, 500)).toBe('skip')
  })
  it('stops once a short queue has failed all the way round', () => {
    expect(afterFailure(3, 3)).toBe('skip')
    expect(afterFailure(4, 3)).toBe('stop')
  })
})

describe('follows', () => {
  const t = (id: string, part?: Track['part']): Track => ({
    id,
    title: id,
    duration: 1,
    albumId: 'a',
    artist: '',
    album: '',
    no: 1,
    disc: 1,
    codec: '',
    folder: 0,
    ...(part ? { part } : {})
  })

  it('is true for the next stretch of the same file', () => {
    expect(
      follows(t('1', { file: 'f', start: 0, end: 10.5 }), t('2', { file: 'f', start: 10.5 }))
    ).toBe(true)
  })

  it('is false for a gap, another file, the last track, or whole files', () => {
    const a = t('1', { file: 'f', start: 0, end: 10 })
    expect(follows(a, t('2', { file: 'f', start: 12, end: 20 }))).toBe(false)
    expect(follows(a, t('2', { file: 'g', start: 10 }))).toBe(false)
    expect(follows(t('1', { file: 'f', start: 0 }), t('2', { file: 'f', start: 0 }))).toBe(false)
    expect(follows(t('1'), t('2'))).toBe(false)
    expect(follows(undefined, a)).toBe(false)
  })
})

// songs put in with "Play next" (`next` of them, right after the current one)
const qn = (
  index: number,
  next: number,
  items = ['a/0', 'a/1', 'a/2', 'a/3', 'a/4']
): QueueState => ({
  items,
  index,
  from: 'A',
  next
})

describe('insertNext', () => {
  it('puts the songs right after the current one, the newest first', () => {
    const s = insertNext(q(0), ['x', 'y'])
    expect(s).toEqual({ items: ['a/0', 'x', 'y', 'a/1', 'a/2'], index: 0, from: 'A', next: 2 })
    expect(insertNext(s, ['z']).items).toEqual(['a/0', 'z', 'x', 'y', 'a/1', 'a/2'])
    expect(insertNext(s, ['z']).next).toBe(3)
  })

  it('fills an empty queue, with the first song current', () => {
    const empty = { items: [], index: 0, from: '' }
    expect(insertNext(empty, ['x', 'y'], 'Blue')).toEqual({
      items: ['x', 'y'],
      index: 0,
      from: 'Blue'
    })
  })

  it('does nothing with no songs', () => {
    const s = q(1)
    expect(insertNext(s, [])).toBe(s)
  })
})

describe('append', () => {
  it('adds the songs at the end, keeping the place and the Play next songs', () => {
    expect(append(qn(1, 1, ['a', 'b', 'c']), ['x'])).toEqual(qn(1, 1, ['a', 'b', 'c', 'x']))
  })

  it('fills an empty queue, with the first song current', () => {
    expect(append({ items: [], index: 0, from: '' }, ['x'], 'Blue')).toEqual({
      items: ['x'],
      index: 0,
      from: 'Blue'
    })
  })

  it('keeps where the list came from when it had songs', () => {
    expect(append(q(0), ['x'], 'Other').from).toBe('A')
  })
})

describe('removeRow', () => {
  it('keeps the current song when a row before it goes', () => {
    expect(removeRow(q(2), 0)).toEqual({ items: ['a/1', 'a/2'], index: 1, from: 'A' })
  })

  it('keeps the index when a row after it goes', () => {
    expect(removeRow(q(0), 2)).toEqual({ items: ['a/0', 'a/1'], index: 0, from: 'A' })
  })

  it('makes the next song current when the current one goes', () => {
    expect(removeRow(q(1), 1)).toEqual({ items: ['a/0', 'a/2'], index: 1, from: 'A' })
  })

  it('goes back one when the current song was the last', () => {
    expect(removeRow(q(2), 2)).toEqual({ items: ['a/0', 'a/1'], index: 1, from: 'A' })
  })

  it('empties the queue with its last song', () => {
    expect(removeRow(q(0, ['a/0']), 0)).toEqual({ items: [], index: 0, from: '' })
  })

  it('counts one Play next song less when one of them goes', () => {
    expect(removeRow(qn(0, 2), 1).next).toBe(1)
    expect(removeRow(qn(0, 2), 3).next).toBe(2)
    // the current song goes: the first Play next song is now playing
    expect(removeRow(qn(0, 2), 0).next).toBe(1)
  })

  it('ignores rows out of range', () => {
    const s = q(1)
    expect(removeRow(s, 3)).toBe(s)
    expect(removeRow(s, -1)).toBe(s)
  })
})

describe('moveRow', () => {
  it('keeps the current song current when a row moves past it', () => {
    // a/0 goes below the current a/1
    expect(moveRow(q(1), 0, 2)).toEqual({ items: ['a/1', 'a/2', 'a/0'], index: 0, from: 'A' })
    // a/2 goes above the current a/1
    expect(moveRow(q(1), 2, 0)).toEqual({ items: ['a/2', 'a/0', 'a/1'], index: 2, from: 'A' })
  })

  it('follows the current song when it moves', () => {
    expect(moveRow(q(0), 0, 2)).toEqual({ items: ['a/1', 'a/2', 'a/0'], index: 2, from: 'A' })
  })

  it('leaves the index alone for moves on one side of it', () => {
    expect(moveRow(q(0), 1, 2)).toEqual({ items: ['a/0', 'a/2', 'a/1'], index: 0, from: 'A' })
  })

  it('does nothing for the same place or rows out of range', () => {
    const s = q(1)
    expect(moveRow(s, 1, 1)).toBe(s)
    expect(moveRow(s, 3, 0)).toBe(s)
    expect(moveRow(s, 0, 3)).toBe(s)
  })

  it('a row moved to right after the current song plays next, with shuffle too', () => {
    const s = moveRow(q(0, ['a/0', 'a/1', 'a/2', 'a/3']), 3, 1)
    expect(s).toEqual({ items: ['a/0', 'a/3', 'a/1', 'a/2'], index: 0, from: 'A', next: 1 })
    // from above the current song: it lands right after it as well
    expect(moveRow(q(2, ['a/0', 'a/1', 'a/2', 'a/3']), 0, 2)).toEqual({
      items: ['a/1', 'a/2', 'a/0', 'a/3'],
      index: 1,
      from: 'A',
      next: 1
    })
  })

  it('a row dropped among the Play next songs joins them; one taken out leaves', () => {
    expect(moveRow(qn(0, 2), 4, 2).next).toBe(3)
    expect(moveRow(qn(0, 2), 1, 4).next).toBe(1)
    expect(moveRow(qn(0, 2), 2, 1).next).toBe(2)
  })
})

describe('clearQueue', () => {
  it('keeps only the current song', () => {
    expect(clearQueue(qn(1, 1))).toEqual({ items: ['a/1'], index: 0, from: 'A' })
  })

  it('empties a queue that holds only the current song', () => {
    expect(clearQueue(q(0, ['a/0']))).toEqual({ items: [], index: 0, from: '' })
  })
})

describe('Play next songs with shuffle and repeat', () => {
  const o = { shuffle: true, nextAlbum, random: () => 0.99 }

  it('shuffle plays the Play next songs first, in order', () => {
    const s1 = advance(qn(0, 2), o)
    expect(s1).toEqual(qn(1, 1))
    const s2 = advance(s1, o)
    expect(s2).toEqual({ ...qn(2, 0), next: undefined })
    // then random again
    expect(advance(s2, o).index).toBe(4)
  })

  it('without shuffle they are simply next, counted down as they play', () => {
    expect(advance(qn(0, 2), { shuffle: false, nextAlbum }).next).toBe(1)
  })

  it('repeat replays the current song; the Play next songs wait', () => {
    expect(onEnded(qn(0, 2), true, o)).toEqual({ kind: 'replay' })
  })

  it('Previous keeps them waiting behind the song you left', () => {
    expect(back(qn(2, 1), 0).state).toEqual(qn(1, 2))
    expect(back(q(2), 0).state.next).toBeUndefined()
  })

  it('a click on one of them plays it and keeps the rest', () => {
    expect(jump(qn(0, 3), 2)).toEqual(qn(2, 1))
    expect(jump(qn(0, 3), 4).next).toBeUndefined()
    expect(jump(qn(2, 1), 0).next).toBeUndefined()
  })

  it('a rescan keeps the ones left', () => {
    expect(prune(qn(0, 2), (id) => id !== 'a/1')).toEqual(qn(0, 1, ['a/0', 'a/2', 'a/3', 'a/4']))
  })
})

describe('queueNotice', () => {
  it('names one song, counts more', () => {
    expect(queueNotice('next', ['x'], 'Song')).toBe('Playing next: "Song"')
    expect(queueNotice('next', ['x', 'y'], 'Song')).toBe('Playing next: 2 songs')
    expect(queueNotice('add', ['x'], 'Song')).toBe('Added to the queue: "Song"')
    expect(queueNotice('add', ['x', 'y', 'z'], 'Song')).toBe('Added 3 songs to the queue')
  })
})
