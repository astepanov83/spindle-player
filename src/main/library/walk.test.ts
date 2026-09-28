import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { readdir, realpath, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Pacer } from './pacer'
import { walk, type WalkFs } from './walk'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spindle-walk-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function file(rel: string): void {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, '')
}

// Lists in the given order, and answers realpath and stat after a delay, so
// the first answer is not the first asked.
function fsWith(order: 'asc' | 'desc', delays: number[]): WalkFs {
  let n = 0
  const later = <T>(v: T): Promise<T> =>
    new Promise((r) => setTimeout(() => r(v), delays[n++ % delays.length]))
  return {
    realpath: async (p) => later(await realpath(p)),
    readdir: async (p) => {
      const list = await readdir(p, { withFileTypes: true })
      list.sort((a, b) => (a.name < b.name ? -1 : 1))
      return later(order === 'asc' ? list : list.reverse())
    },
    stat: async (p) => later(await stat(p))
  }
}

const run = (roots: string[], fs?: WalkFs): ReturnType<typeof walk> =>
  walk(roots, new Pacer(8, 1, false), () => {}, undefined, fs)

const sorted = (list: string[]): string[] => [...list].sort()

describe('walk', () => {
  it('lists songs, cue sheets and folder images, and skips dot folders', async () => {
    file('A/01.flac')
    file('A/a.cue')
    file('A/cover.jpg')
    file('A/notes.txt')
    file('.hidden/x.mp3')
    const out = await run([root])
    expect(out.files).toEqual([join(root, 'A/01.flac')])
    expect(out.cues).toEqual([join(root, 'A/a.cue')])
    expect(out.images).toEqual([join(root, 'A/cover.jpg')])
    expect(out.skipped).toEqual([])
  })

  it('keeps the real path over a symlink to it, in any listing order', async () => {
    file('Artist/Album/01.flac')
    // shallower than the real folder, and sorts first
    symlinkSync(join(root, 'Artist/Album'), join(root, 'Aa fav'))
    for (const order of ['asc', 'desc'] as const)
      for (const delays of [[0], [5, 0, 1], [0, 5]]) {
        const out = await run([root], fsWith(order, delays))
        expect(out.files).toEqual([join(root, 'Artist/Album/01.flac')])
      }
  })

  it('takes the path that sorts first when only symlinks reach a folder', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'spindle-walk-out-'))
    try {
      writeFileSync(join(outside, '01.flac'), '')
      symlinkSync(outside, join(root, 'b'))
      symlinkSync(outside, join(root, 'a'))
      for (const order of ['asc', 'desc'] as const)
        for (const delays of [[0], [5, 0], [0, 5]]) {
          const out = await run([root], fsWith(order, delays))
          expect(out.files).toEqual([join(root, 'a/01.flac')])
        }
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('keeps the path of a folder reached one way, also through a symlink', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'spindle-walk-out-'))
    try {
      writeFileSync(join(outside, '01.flac'), '')
      symlinkSync(outside, join(root, 'Linked'))
      file('Real/02.flac')
      const out = await run([root])
      expect(sorted(out.files)).toEqual([join(root, 'Linked/01.flac'), join(root, 'Real/02.flac')])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('prefers a music folder the user picked over a symlink into it', async () => {
    const other = mkdtempSync(join(tmpdir(), 'spindle-walk-other-'))
    try {
      writeFileSync(join(other, '01.flac'), '')
      symlinkSync(other, join(root, 'Other'))
      const out = await run([root, other])
      expect(out.files).toEqual([join(other, '01.flac')])
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it('walks a symlink loop once', async () => {
    file('A/01.flac')
    symlinkSync(root, join(root, 'A/loop'))
    const out = await run([root])
    expect(out.files).toEqual([join(root, 'A/01.flac')])
  })

  it('reports folders it cannot read', async () => {
    const gone = join(root, 'gone')
    const out = await run([gone])
    expect(out.skipped).toEqual([gone])
  })

  it('keeps the songs of a symlinked folder whose real path fails', async () => {
    file('A/01.flac')
    symlinkSync(join(root, 'A'), join(root, 'B'))
    const fs: WalkFs = {
      realpath: async (p) => {
        if (p === join(root, 'B')) throw new Error('EACCES')
        return realpath(p)
      },
      readdir: (p) => readdir(p, { withFileTypes: true }),
      stat: (p) => stat(p)
    }
    const out = await run([root], fs)
    expect(out.skipped).toEqual([join(root, 'B')])
    expect(out.files).toEqual([join(root, 'A/01.flac')])
  })

  it('drops a symlink to nothing', async () => {
    symlinkSync(join(root, 'nowhere'), join(root, 'dead'))
    const out = await run([root])
    expect(out.skipped).toEqual([])
    expect(out.files).toEqual([])
  })
})
