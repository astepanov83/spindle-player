import { describe, expect, it, vi } from 'vitest'
import type { SongNotice } from '../shared/ipc'

vi.mock('electron', () => ({}))
vi.mock('../../resources/icon.png?asset', () => ({ default: '' }))

const { coverHash, inFront, parseSongNotice, SongNotify } = await import('./notify')
type NotifyIo = import('./notify').NotifyIo

const hash = 'a'.repeat(40)
const cover = `spindle://cover/small/${hash}`

describe('parseSongNotice', () => {
  it('keeps a title, a body and a small cover', () => {
    const n = { title: 'Red Water', body: 'Kaleo · A/B', cover }
    expect(parseSongNotice(n)).toEqual(n)
  })

  it('needs a title and a body', () => {
    expect(parseSongNotice({ title: '', body: 'x' })).toBeUndefined()
    expect(parseSongNotice({ title: 'x' })).toBeUndefined()
    expect(parseSongNotice('x')).toBeUndefined()
    expect(parseSongNotice(null)).toBeUndefined()
    expect(parseSongNotice({ title: 'x', body: '' })).toEqual({ title: 'x', body: '' })
  })

  it('drops a cover that is not one of the cache', () => {
    for (const bad of [
      'file:///etc/passwd',
      `spindle://cover/large/${hash}`,
      'spindle://cover/small/../x',
      7
    ])
      expect(parseSongNotice({ title: 'x', body: '', cover: bad })).toEqual({
        title: 'x',
        body: ''
      })
  })

  it('cuts a huge text', () => {
    expect(parseSongNotice({ title: 'x'.repeat(5000), body: '' })?.title).toHaveLength(500)
  })
})

describe('coverHash', () => {
  it('reads the hash of a small cover only', () => {
    expect(coverHash(cover)).toBe(hash)
    expect(coverHash(`spindle://cover/small/${hash}/x`)).toBeUndefined()
    expect(coverHash('spindle://cover/small/abc')).toBeUndefined()
    expect(coverHash(`spindle://cover/mosaic/${hash}`)).toBeUndefined()
  })
})

describe('inFront', () => {
  const w = { visible: true, minimized: false, focused: true }

  it('is true only for a shown, focused window', () => {
    expect(inFront(w)).toBe(true)
    expect(inFront({ ...w, focused: false })).toBe(false)
    expect(inFront({ ...w, visible: false })).toBe(false)
    expect(inFront({ ...w, minimized: true })).toBe(false)
    expect(inFront(undefined)).toBe(false)
  })
})

describe('SongNotify', () => {
  function make(o: Partial<NotifyIo> = {}): {
    notify: InstanceType<typeof SongNotify>
    shown: SongNotice[]
    closed: SongNotice[]
  } {
    const shown: SongNotice[] = []
    const closed: SongNotice[] = []
    const notify = new SongNotify({
      supported: () => true,
      on: () => true,
      window: () => ({ visible: true, minimized: false, focused: false }),
      show: (n) => {
        shown.push(n)
        return { close: () => closed.push(n) }
      },
      ...o
    })
    return { notify, shown, closed }
  }
  const a = { title: 'A', body: 'Artist · Album' }
  const b = { title: 'B', body: '' }

  it('shows one at a time: a new one closes the last', () => {
    const { notify, shown, closed } = make()
    notify.song(a)
    notify.song(b)
    expect(shown).toEqual([a, b])
    expect(closed).toEqual([a])
  })

  it('shows nothing while the window is in front', () => {
    const { notify, shown } = make({
      window: () => ({ visible: true, minimized: false, focused: true })
    })
    notify.song(a)
    expect(shown).toEqual([])
  })

  it('shows one for a hidden window, or with no window (macOS after close)', () => {
    const none = make({ window: () => undefined })
    none.notify.song(a)
    expect(none.shown).toEqual([a])
    const hidden = make({ window: () => ({ visible: false, minimized: false, focused: true }) })
    hidden.notify.song(a)
    expect(hidden.shown).toEqual([a])
  })

  it('shows nothing with the setting off, or no notifications on the system', () => {
    const off = make({ on: () => false })
    off.notify.song(a)
    expect(off.shown).toEqual([])
    const none = make({ supported: () => false })
    none.notify.song(a)
    expect(none.shown).toEqual([])
    expect(none.notify.supported()).toBe(false)
  })

  it('ignores a bad message', () => {
    const { notify, shown } = make()
    notify.song({ title: 3 })
    expect(shown).toEqual([])
  })
})
