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
  passOver,
  prune,
  queueNotice,
  removeRow,
  undoRemove,
  type QueueState
} from './logic'
import { queueLink } from '../../../shared/saved-queue'
import type { ItemKey } from '../../../shared/plugins/items'

const q = (
  index: number,
  items: ItemKey[] = ['files:a/0', 'files:a/1', 'files:a/2']
): QueueState => ({
  items,
  index,
  from: 'A'
})

describe('advance', () => {
  it('goes to the next song', () => {
    expect(advance(q(0), { shuffle: false }).index).toBe(1)
  })

  it('stays put at the end of the queue: no other album is added', () => {
    const s = q(2)
    expect(advance(s, { shuffle: false })).toBe(s)
  })

  it('shuffle picks another song, never the current one', () => {
    for (const r of [0, 0.2, 0.5, 0.99]) {
      const s = advance(q(1), { shuffle: true, random: () => r })
      expect(s.index).not.toBe(1)
      expect(s.index).toBeGreaterThanOrEqual(0)
      expect(s.index).toBeLessThan(3)
    }
  })

  it('shuffle with one song has nowhere to go', () => {
    const s = q(0, ['files:a/0'])
    expect(advance(s, { shuffle: true })).toBe(s)
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
    expect(prune(q(2), has(['files:a/0']))).toEqual({
      items: ['files:a/1', 'files:a/2'],
      index: 1,
      from: 'A'
    })
  })

  it('moves to the next song left when the current one is gone', () => {
    expect(prune(q(1), has(['files:a/1']))).toEqual({
      items: ['files:a/0', 'files:a/2'],
      index: 1,
      from: 'A'
    })
  })

  it('moves to the last song when the current one and all after it are gone', () => {
    expect(prune(q(1), has(['files:a/1', 'files:a/2']))).toEqual({
      items: ['files:a/0'],
      index: 0,
      from: 'A'
    })
  })

  it('empties the queue when every song is gone', () => {
    expect(prune(q(1), () => false)).toEqual({ items: [], index: 0, from: 'A' })
  })
})

describe('onEnded', () => {
  it('replays the song with repeat on', () => {
    expect(onEnded(q(1), true, { shuffle: false })).toEqual({ kind: 'replay' })
  })

  it('plays the next song', () => {
    const r = onEnded(q(0), false, { shuffle: false })
    expect(r).toEqual({ kind: 'play', state: q(1) })
  })

  it('stops when the queue runs out', () => {
    expect(onEnded(q(2), false, { shuffle: false })).toEqual({ kind: 'stop' })
  })

  it('repeat still replays the last song', () => {
    expect(onEnded(q(2), true, { shuffle: false })).toEqual({ kind: 'replay' })
  })

  it('shuffle picks another song from the list', () => {
    const r = onEnded(q(0), false, { shuffle: true, random: () => 0.99 })
    expect(r.kind === 'play' && r.state.index).toBe(1)
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
  items: ItemKey[] = ['files:a/0', 'files:a/1', 'files:a/2', 'files:a/3', 'files:a/4']
): QueueState => ({
  items,
  index,
  from: 'A',
  next
})

describe('insertNext', () => {
  it('puts the songs right after the current one, the newest first', () => {
    const s = insertNext(q(0), ['files:x', 'files:y'])
    expect(s).toEqual({
      items: ['files:a/0', 'files:x', 'files:y', 'files:a/1', 'files:a/2'],
      index: 0,
      from: 'A',
      next: 2
    })
    expect(insertNext(s, ['files:z']).items).toEqual([
      'files:a/0',
      'files:z',
      'files:x',
      'files:y',
      'files:a/1',
      'files:a/2'
    ])
    expect(insertNext(s, ['files:z']).next).toBe(3)
  })

  it('fills an empty queue, with the first song current', () => {
    const empty = { items: [], index: 0, from: '' }
    expect(insertNext(empty, ['files:x', 'files:y'], 'Blue')).toEqual({
      items: ['files:x', 'files:y'],
      index: 0,
      from: 'Blue'
    })
  })

  it('takes what "From" opens with the songs it names (ticket 040)', () => {
    const empty = { items: [], index: 0, from: '' }
    const link = queueLink('album', 'blue')
    expect(insertNext(empty, ['files:x'], 'Blue', link).link).toEqual(link)
    expect(insertNext({ ...q(0), link }, ['files:x'], 'Other', queueLink('album', 'o')).link).toBe(
      link
    )
  })

  it('does nothing with no songs', () => {
    const s = q(1)
    expect(insertNext(s, [])).toBe(s)
  })
})

describe('append', () => {
  it('adds the songs at the end, keeping the place and the Play next songs', () => {
    expect(append(qn(1, 1, ['files:a', 'files:b', 'files:c']), ['files:x'])).toEqual(
      qn(1, 1, ['files:a', 'files:b', 'files:c', 'files:x'])
    )
  })

  it('fills an empty queue, with the first song current', () => {
    expect(append({ items: [], index: 0, from: '' }, ['files:x'], 'Blue')).toEqual({
      items: ['files:x'],
      index: 0,
      from: 'Blue'
    })
  })

  it('keeps where the list came from when it had songs', () => {
    expect(append(q(0), ['files:x'], 'Other').from).toBe('A')
    expect(append(q(0), ['files:x'], 'Other', queueLink('album', 'o')).link).toBeUndefined()
  })

  it('takes what "From" opens when it fills an empty queue (ticket 040)', () => {
    const link = queueLink('playlist', 'p1')
    expect(append({ items: [], index: 0, from: '' }, ['files:x'], 'Mix', link)).toEqual({
      items: ['files:x'],
      index: 0,
      from: 'Mix',
      link
    })
  })
})

describe('removeRow', () => {
  it('keeps the current song when a row before it goes', () => {
    expect(removeRow(q(2), 0)).toEqual({ items: ['files:a/1', 'files:a/2'], index: 1, from: 'A' })
  })

  it('keeps the index when a row after it goes', () => {
    expect(removeRow(q(0), 2)).toEqual({ items: ['files:a/0', 'files:a/1'], index: 0, from: 'A' })
  })

  it('makes the next song current when the current one goes', () => {
    expect(removeRow(q(1), 1)).toEqual({ items: ['files:a/0', 'files:a/2'], index: 1, from: 'A' })
  })

  it('goes back one when the current song was the last', () => {
    expect(removeRow(q(2), 2)).toEqual({ items: ['files:a/0', 'files:a/1'], index: 1, from: 'A' })
  })

  it('empties the queue with its last song', () => {
    expect(removeRow(q(0, ['files:a/0']), 0)).toEqual({ items: [], index: 0, from: '' })
    const link = queueLink('album', 'a')
    expect(removeRow({ ...q(0, ['files:a/0']), link }, 0)).toEqual({
      items: [],
      index: 0,
      from: ''
    })
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

describe('undoRemove (ticket 071)', () => {
  // remove row `at` from `before`, then undo it with the queue as `now`
  const undo = (
    before: QueueState,
    at: number,
    now: (after: QueueState) => QueueState = (a) => a
  ): ReturnType<typeof undoRemove> => {
    const after = removeRow(before, at)
    return undoRemove(now(after), before, after, at)
  }

  it('puts a row back at its place, before or after the current song', () => {
    expect(undo(q(2), 0)).toEqual({ state: q(2), restart: false })
    expect(undo(q(0), 2)).toEqual({ state: q(0), restart: false })
    expect(undo(q(1), 1)).toEqual({ state: q(1), restart: true })
  })

  it('makes a removed current song current again, also the last one left', () => {
    const link = queueLink('album', 'a')
    const one = { ...q(0, ['files:a/0']), link }
    expect(undo(one, 0)).toEqual({ state: one, restart: true })
    expect(undo(q(2), 2)).toEqual({ state: q(2), restart: true })
  })

  it('keeps the song picked since, with the removed current song back as a row', () => {
    // a/1 went, a/2 played, then Previous went to a/0
    const r = undo(q(1), 1, (a) => ({ ...a, index: 0 }))
    expect(r).toEqual({ state: q(0), restart: false })
    // a/0 went, then a/2 was picked
    expect(undo(q(0), 0, (a) => ({ ...a, index: 1 }))).toEqual({ state: q(2), restart: false })
  })

  it('follows the current song when it moved on since', () => {
    // a/0 went while a/1 played, then a/2 started
    expect(undo(q(1), 0, (a) => ({ ...a, index: 1 }))).toEqual({ state: q(2), restart: false })
  })

  it('counts a Play next song again when it comes back', () => {
    expect(undo(qn(0, 2), 1).state).toEqual(qn(0, 2))
    expect(undo(qn(0, 2), 2).state).toEqual(qn(0, 2))
    expect(undo(qn(0, 2), 3).state).toEqual(qn(0, 2))
    // the current song came back as a row behind the song playing: not a Play next song
    expect(undo(qn(0, 2), 0, (a) => ({ ...a, index: 1, next: 0 })).state.next).toBeUndefined()
  })
})

describe('moveRow', () => {
  it('keeps the current song current when a row moves past it', () => {
    // a/0 goes below the current a/1
    expect(moveRow(q(1), 0, 2)).toEqual({
      items: ['files:a/1', 'files:a/2', 'files:a/0'],
      index: 0,
      from: 'A'
    })
    // a/2 goes above the current a/1
    expect(moveRow(q(1), 2, 0)).toEqual({
      items: ['files:a/2', 'files:a/0', 'files:a/1'],
      index: 2,
      from: 'A'
    })
  })

  it('follows the current song when it moves', () => {
    expect(moveRow(q(0), 0, 2)).toEqual({
      items: ['files:a/1', 'files:a/2', 'files:a/0'],
      index: 2,
      from: 'A'
    })
  })

  it('leaves the index alone for moves on one side of it', () => {
    expect(moveRow(q(0), 1, 2)).toEqual({
      items: ['files:a/0', 'files:a/2', 'files:a/1'],
      index: 0,
      from: 'A'
    })
  })

  it('does nothing for the same place or rows out of range', () => {
    const s = q(1)
    expect(moveRow(s, 1, 1)).toBe(s)
    expect(moveRow(s, 3, 0)).toBe(s)
    expect(moveRow(s, 0, 3)).toBe(s)
  })

  it('a row moved to right after the current song plays next, with shuffle too', () => {
    const s = moveRow(q(0, ['files:a/0', 'files:a/1', 'files:a/2', 'files:a/3']), 3, 1)
    expect(s).toEqual({
      items: ['files:a/0', 'files:a/3', 'files:a/1', 'files:a/2'],
      index: 0,
      from: 'A',
      next: 1
    })
    // from above the current song: it lands right after it as well
    expect(moveRow(q(2, ['files:a/0', 'files:a/1', 'files:a/2', 'files:a/3']), 0, 2)).toEqual({
      items: ['files:a/1', 'files:a/2', 'files:a/0', 'files:a/3'],
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
    expect(clearQueue(qn(1, 1))).toEqual({ items: ['files:a/1'], index: 0, from: 'A' })
  })

  it('empties a queue that holds only the current song', () => {
    expect(clearQueue(q(0, ['files:a/0']))).toEqual({ items: [], index: 0, from: '' })
    const link = queueLink('album', 'a')
    expect(clearQueue({ ...q(0, ['files:a/0']), link })).toEqual({ items: [], index: 0, from: '' })
    expect(clearQueue({ ...qn(1, 1), link }).link).toBe(link)
  })
})

describe('Play next songs with shuffle and repeat', () => {
  const o = { shuffle: true, random: () => 0.99 }

  it('shuffle plays the Play next songs first, in order', () => {
    const s1 = advance(qn(0, 2), o)
    expect({ ...s1, shuffle: undefined }).toEqual({ ...qn(1, 1), shuffle: undefined })
    const s2 = advance(s1, o)
    expect(s2.index).toBe(2)
    expect(s2.next).toBeUndefined()
    // then the walk again, on the rows not played yet
    expect([3, 4]).toContain(advance(s2, o).index)
  })

  it('without shuffle they are simply next, counted down as they play', () => {
    expect(advance(qn(0, 2), { shuffle: false }).next).toBe(1)
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
    expect(prune(qn(0, 2), (id) => id !== 'files:a/1')).toEqual(
      qn(0, 1, ['files:a/0', 'files:a/2', 'files:a/3', 'files:a/4'])
    )
  })
})

describe('queueNotice', () => {
  it('names one song, counts more', () => {
    expect(queueNotice('next', ['files:x'], 'Song')).toBe('Playing next: "Song"')
    expect(queueNotice('next', ['files:x', 'files:y'], 'Song')).toBe('Playing next: 2 songs')
    expect(queueNotice('add', ['files:x'], 'Song')).toBe('Added to the queue: "Song"')
    expect(queueNotice('add', ['files:x', 'files:y', 'files:z'], 'Song')).toBe(
      'Added 3 songs to the queue'
    )
  })
})

describe('passOver (ticket 056)', () => {
  const items: ItemKey[] = ['files:a', 'mfp:b', 'mfp:c', 'files:d']
  const off = (k: ItemKey): boolean => k.startsWith('mfp:')
  const next = (s: QueueState): QueueState => advance(s, { shuffle: false })

  it('goes on to the next song that can play', () => {
    expect(passOver(q(1, items), off, next).index).toBe(3)
  })

  it('leaves a song that can play where it is', () => {
    const s = q(0, items)
    expect(passOver(s, off, next)).toBe(s)
  })

  it('gives the same state when none after can play', () => {
    const s = q(1, ['files:a', 'mfp:b', 'mfp:c'])
    expect(passOver(s, off, next)).toBe(s)
  })
})

describe('the shuffle walk (ticket 076)', () => {
  // a fixed sequence, so a failing case can be run again
  function seeded(seed: number): () => number {
    let a = seed
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const keys = (n: number, p = 's'): ItemKey[] =>
    Array.from({ length: n }, (_, i) => `files:${p}${i}` as ItemKey)
  const cur = (s: QueueState): ItemKey => s.items[s.index]
  // the songs Next plays, by key, as rows move
  function walk(
    s: QueueState,
    steps: number,
    o: { shuffle: boolean; random: () => number }
  ): { s: QueueState; played: ItemKey[] } {
    const played: ItemKey[] = []
    for (let i = 0; i < steps; i++) {
      s = advance(s, o)
      played.push(cur(s))
    }
    return { s, played }
  }

  it('plays every song once before any repeats, round after round', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const o = { shuffle: true, random: seeded(seed) }
      let s: QueueState = { items: keys(10), index: 3, from: 'X' }
      const first = walk(s, 9, o)
      expect(new Set([cur(s), ...first.played]).size).toBe(10)
      s = first.s
      const second = walk(s, 10, o)
      expect(new Set(second.played).size).toBe(10)
      // no song twice in a row where one round meets the next
      expect(second.played[0]).not.toBe(cur(s))
    }
  })

  it('Play next songs come first, and play once in the round', () => {
    const o = { shuffle: true, random: seeded(7) }
    let s: QueueState = { items: keys(6), index: 0, from: 'X' }
    s = walk(s, 2, o).s
    s = insertNext(s, ['files:n0', 'files:n1'])
    const r = walk(s, 5, o)
    expect(r.played.slice(0, 2)).toEqual(['files:n0', 'files:n1'])
    // the rest of the round: the 3 songs not played yet
    const before = new Set([...keys(6)].filter((k) => !r.played.includes(k)))
    expect(before.size).toBe(3)
    expect(new Set(r.played).size).toBe(5)
  })

  it('songs added to the queue play in this round; removed ones never', () => {
    const o = { shuffle: true, random: seeded(11) }
    let s: QueueState = { items: keys(5), index: 0, from: 'X' }
    s = walk(s, 2, o).s
    const played = new Set(s.shuffle!.order.slice(0, 3).map((r) => s.items[r]))
    s = append(s, ['files:x0', 'files:x1'])
    const gone = s.items.findIndex((k) => !played.has(k))
    const goneKey = s.items[gone]
    s = removeRow(s, gone)
    const r = walk(s, 3, o)
    expect(r.played).not.toContain(goneKey)
    expect(r.played).toEqual(expect.arrayContaining(['files:x0', 'files:x1']))
    expect(new Set([...played, ...r.played]).size).toBe(6)
  })

  it('moved rows keep their place in the walk', () => {
    const o = { shuffle: true, random: seeded(5) }
    let s: QueueState = { items: keys(6), index: 2, from: 'X' }
    const a = walk(s, 2, o)
    s = moveRow(a.s, 0, 5)
    s = moveRow(s, 4, 1)
    const b = walk(s, 3, o)
    expect(new Set(['files:s2', ...a.played, ...b.played]).size).toBe(6)
  })

  it('removing the current song plays the one the walk had next', () => {
    const o = { shuffle: true, random: seeded(3) }
    const s = walk({ items: keys(6), index: 0, from: 'X' }, 1, o).s
    const w = s.shuffle!
    const nextKey = s.items[w.order[w.at + 1]]
    const r = removeRow(s, s.index)
    expect(cur(r)).toBe(nextKey)
    expect(r.shuffle!.order[r.shuffle!.at]).toBe(r.index)
  })

  it('Previous goes back along the walk, and Next goes the same way again', () => {
    const o = { shuffle: true, random: seeded(9) }
    const start: QueueState = { items: keys(8), index: 4, from: 'X' }
    const a = walk(start, 3, o)
    let s = a.s
    s = back(s, 0, true).state
    expect(cur(s)).toBe(a.played[1])
    s = back(s, 0, true).state
    expect(cur(s)).toBe(a.played[0])
    s = back(s, 0, true).state
    expect(cur(s)).toBe('files:s4')
    // the start of the walk: Previous restarts
    expect(back(s, 0, true).restart).toBe(true)
    expect(walk(s, 3, o).played).toEqual(a.played)
  })

  it('Previous restarts when shuffle has not picked a song yet', () => {
    const s = q(2)
    expect(back(s, 0, true)).toEqual({ state: s, restart: true })
  })

  it('Previous keeps Play next songs waiting behind the song you left', () => {
    const o = { shuffle: true, random: seeded(2) }
    let s = walk({ items: keys(6), index: 0, from: 'X' }, 2, o).s
    const left = cur(s)
    s = insertNext(s, ['files:n0'])
    s = back(s, 0, true).state
    expect(s.next).toBeUndefined()
    expect(walk(s, 2, o).played).toEqual([left, 'files:n0'])
  })

  it('a click plays that row, and it does not play again in the round', () => {
    const o = { shuffle: true, random: seeded(4) }
    let s = walk({ items: keys(5), index: 0, from: 'X' }, 1, o).s
    const w = s.shuffle!
    const later = w.order[w.order.length - 1]
    s = jump(s, later)
    const r = walk(s, 2, o)
    expect(r.played).not.toContain(keys(5)[later])
    expect(new Set(r.played).size).toBe(2)
  })

  it('Clear and a rescan keep the walk on the current song', () => {
    const o = { shuffle: true, random: seeded(6) }
    let s = walk({ items: keys(5), index: 0, from: 'X' }, 2, o).s
    const c = clearQueue(s)
    expect(c.shuffle!.order[c.shuffle!.at]).toBe(0)
    const k = cur(s)
    s = prune(s, (id) => id === k || id === 'files:s0' || id === 'files:s4')
    expect(cur(s)).toBe(k)
    expect(s.shuffle!.order[s.shuffle!.at]).toBe(s.index)
  })

  it('Undo of a Remove puts a played song back among the played ones', () => {
    const o = { shuffle: true, random: seeded(8) }
    const s = walk({ items: keys(5), index: 0, from: 'X' }, 2, o).s
    // the first song played this round
    const after = removeRow(s, 0)
    const { state } = undoRemove(after, s, after, 0)
    expect(state.items).toEqual(s.items)
    const r = walk(state, 2, o)
    expect(r.played).not.toContain('files:s0')
    expect(
      new Set([...s.shuffle!.order.slice(0, 3).map((x) => s.items[x]), ...r.played]).size
    ).toBe(5)
  })

  it('shuffle off drops the walk', () => {
    const o = { shuffle: true, random: seeded(1) }
    const s = walk({ items: keys(5), index: 0, from: 'X' }, 1, o).s
    expect(s.shuffle).toBeDefined()
    if (s.index < 4) expect(advance(s, { shuffle: false }).shuffle).toBeUndefined()
  })
})
