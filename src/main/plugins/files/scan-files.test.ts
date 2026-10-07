// The scan's walk, stats and reads together, on temp folders with fake tag,
// cue and image reads, so the test controls how long each takes.
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs'
import { readdir, realpath, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shortHash } from '../../ids'
import { emptyIndex } from './merge'
import { Pacer, Turns } from './pacer'
import { Stopped } from './scan-chain'
import { scanFiles, type ScanOptions } from './scan-files'
import type { WalkFs } from './walk'
import type { FileEntry, LibraryIndex } from './types'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spindle-scan-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function file(rel: string): string {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, rel)
  return p
}

function link(target: string, rel: string): void {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  symlinkSync(join(root, target), p)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// an index entry that matches the file on disk, so it is not read again
function known(path: string, title: string): FileEntry {
  const s = statSync(path, { bigint: true })
  return { path, mtime: Number(s.mtimeMs), size: Number(s.size), duration: 1, title }
}

interface Run {
  opts: ScanOptions
  events: string[]
  reads: string[]
  moved: Record<string, string>[]
}

// A scan with fast pacers and reads that take `readMs` each.
function setup(ix: LibraryIndex, folders: string[], more: Partial<ScanOptions> = {}): Run {
  const events: string[] = []
  const reads: string[] = []
  const moved: Record<string, string>[] = []
  const opts: ScanOptions = {
    ix,
    folders,
    retryFailed: false,
    known: () => true,
    pace: {
      dir: new Pacer(8, 1, false),
      stat: new Pacer(16, 2, false),
      read: new Pacer(1, 1, false)
    },
    check: () => {},
    changed: () => {},
    unsaved: () => {},
    count: () => {},
    lap: () => {},
    walked: () => {},
    moved: (ids) => void moved.push(ids),
    readFile: async (path, mtime, size) => {
      reads.push(path)
      events.push(`file ${basename(path)}`)
      await sleep(5)
      return { path, mtime, size, duration: 1, title: `read ${basename(path)}` }
    },
    readCue: async (f) => {
      events.push(`cue ${basename(f.path)}`)
      await sleep(5)
      return { ...f, reader: 2 }
    },
    readImage: async ({ dir, path }) => ({ path, dir, mtime: 1, size: 1, cover: basename(path) }),
    ...more
  }
  return { opts, events, reads, moved }
}

describe('scanFiles', () => {
  it('keeps when each file was first found (085)', async () => {
    const fresh = file('m/A/01.flac')
    const changed = file('m/A/02.flac')
    const older = file('m/A/03.flac')
    const ix = emptyIndex()
    // read before: it changed since, so it is read again
    ix.files.set(changed, { ...known(changed, 'Old'), mtime: 1, added: 5 })
    // from an index made before the time added was kept
    ix.files.set(older, known(older, 'Older'))
    let changes = 0
    const r = setup(ix, [join(root, 'm')], {
      // a birth time the file system gives (ext4, btrfs); tmpfs may give none
      stat: async (p) => ({ ...(await stat(p, { bigint: true })), birthtimeMs: 1234n }),
      changed: () => void changes++
    })
    await scanFiles(r.opts)
    expect(r.reads.sort()).toEqual([fresh, changed])
    expect(ix.files.get(fresh)?.added).toBe(1234)
    expect(ix.files.get(changed)?.added).toBe(5)
    expect(ix.files.get(older)?.added).toBe(1234)
    expect(ix.files.get(older)?.title).toBe('Older')
    expect(changes).toBeGreaterThanOrEqual(3)
  })

  it('takes the mtime as the time added when there is no birth time', async () => {
    const a = file('m/A/01.flac')
    const r = setup(emptyIndex(), [join(root, 'm')], {
      stat: async (p) => ({ ...(await stat(p, { bigint: true })), birthtimeMs: 0n })
    })
    await scanFiles(r.opts)
    const e = r.opts.ix.files.get(a)!
    expect(e.added).toBe(e.mtime)
  })

  it('reads new files and keeps known ones that did not change', async () => {
    const a = file('m/A/01.flac')
    const b = file('m/A/02.flac')
    const ix = emptyIndex()
    ix.files.set(a, known(a, 'Kept'))
    const r = setup(ix, [join(root, 'm')])
    await scanFiles(r.opts)
    expect(r.reads).toEqual([b])
    expect(ix.files.get(a)?.title).toBe('Kept')
    expect(ix.files.get(b)?.title).toBe('read 02.flac')
  })

  it('finds a move while new files still wait to be read (104)', async () => {
    // /m/links/X -> /data/X was known; the user added /data, whose path now wins (87)
    const old = join(root, 'm/links/X/x.flac')
    const now = file('data/X/x.flac')
    link('data/X', 'm/links/X')
    // /m still has songs of its own, else it would look unplugged
    const own = file('m/own.flac')
    for (let i = 0; i < 20; i++) file(`data/A/${String(i).padStart(2, '0')}.flac`)
    const ix = emptyIndex()
    ix.files.set(own, known(own, 'Own'))
    ix.files.set(old, { ...known(now, 'Kept'), path: old })
    // the first read holds up the rest until the move is found (or a while
    // passes), so the new files queue for reading
    let found = (): void => {}
    const moveFound = new Promise<void>((r) => (found = r))
    const reads: string[] = []
    const r = setup(ix, [join(root, 'm'), join(root, 'data')], {
      // X is listed after A, so a file of A is read first
      walkFs: {
        realpath: (p) => realpath(p),
        readdir: async (p) => {
          if (p.endsWith('X')) await sleep(20)
          return readdir(p, { withFileTypes: true })
        },
        stat: (p) => stat(p)
      },
      moved: (ids) => {
        r.moved.push(ids)
        found()
      },
      readFile: async (path, mtime, size) => {
        reads.push(path)
        if (reads.length === 1) await Promise.race([moveFound, sleep(300)])
        return { path, mtime, size, duration: 1, title: 'read' }
      }
    })
    await scanFiles(r.opts)
    expect(r.moved).toEqual([{ [shortHash(old)]: shortHash(now) }])
    // it keeps what was read, and is not read again
    expect(reads).not.toContain(now)
    expect(ix.files.get(now)?.title).toBe('Kept')
    expect(ix.files.has(old)).toBe(false)
    expect(reads).toHaveLength(20)
  })

  it('finds a move whose new path a save wrote before the move was found', async () => {
    // a save (every 15s, or on quit) mid-scan wrote the new path read; the old one stayed
    const old = join(root, 'm/links/X/x.flac')
    const now = file('data/X/x.flac')
    link('data/X', 'm/links/X')
    const own = file('m/own.flac')
    const ix = emptyIndex()
    ix.files.set(own, known(own, 'Own'))
    ix.files.set(old, { ...known(now, 'Old'), path: old })
    ix.files.set(now, known(now, 'New'))
    const r = setup(ix, [join(root, 'm'), join(root, 'data')])
    await scanFiles(r.opts)
    expect(r.moved).toEqual([{ [shortHash(old)]: shortHash(now) }])
    expect(r.reads).toEqual([])
    expect([...ix.files.keys()].sort()).toEqual([now, own].sort())
  })

  it('finds no move for a deleted file', async () => {
    const gone = join(root, 'm/gone.flac')
    const a = file('m/a.flac')
    const ix = emptyIndex()
    ix.files.set(gone, { path: gone, mtime: 1, size: 1, duration: 1 })
    ix.files.set(a, known(a, 'A'))
    const r = setup(ix, [join(root, 'm')])
    await scanFiles(r.opts)
    expect(r.moved).toEqual([])
    expect([...ix.files.keys()]).toEqual([a])
  })

  it('reads a folder cue sheets before its files', async () => {
    file('m/D/01.flac')
    file('m/D/image.cue')
    file('m/D/image.flac')
    file('m/E/02.flac')
    const r = setup(emptyIndex(), [join(root, 'm')])
    await scanFiles(r.opts)
    const cue = r.events.indexOf('cue image.cue')
    expect(cue).toBeGreaterThanOrEqual(0)
    expect(r.events.indexOf('file 01.flac')).toBeGreaterThan(cue)
    expect(r.events.indexOf('file image.flac')).toBeGreaterThan(cue)
    expect(r.reads).toHaveLength(3)
  })

  it('stops mid-read, and ends only after the running read, with nothing more read', async () => {
    for (let i = 0; i < 10; i++) file(`m/A/${i}.flac`)
    const ix = emptyIndex()
    let stopped = false
    const events: string[] = []
    const r = setup(ix, [join(root, 'm')], {
      check: () => {
        if (stopped) throw new Stopped()
      },
      readFile: async (path, mtime, size) => {
        events.push('read')
        stopped = true
        await sleep(20)
        events.push('read ended')
        return { path, mtime, size, duration: 1 }
      }
    })
    await expect(scanFiles(r.opts).finally(() => events.push('scan ended'))).rejects.toBeInstanceOf(
      Stopped
    )
    expect(events).toEqual(['read', 'read ended', 'scan ended'])
    // what the stopped read gave is dropped
    expect(ix.files.size).toBe(0)
  })

  it("keeps the newest image a folder's walk handed over, whichever read ends last", async () => {
    // C's lone photo is handed over after the next round; a scans folder
    // reached by a symlink, in a later round, then beats it
    file('m/C/01.flac')
    file('m/C/photo.jpg')
    file('elsewhere/Scans/front.jpg')
    link('elsewhere/Scans', 'm/C/Scans')
    mkdirSync(join(root, 'm/X/Y'), { recursive: true })
    const ix = emptyIndex()
    const handed: string[] = []
    const r = setup(ix, [join(root, 'm')], {
      pace: {
        dir: new Pacer(8, 1, false),
        stat: new Pacer(16, 2, false),
        read: new Pacer(4, 1, false)
      },
      readImage: async ({ dir, path }) => {
        handed.push(basename(path))
        // the older one ends last
        if (path.endsWith('photo.jpg')) await sleep(40)
        return { path, dir, mtime: 1, size: 1, cover: basename(path) }
      }
    })
    await scanFiles(r.opts)
    expect(handed).toEqual(['photo.jpg', 'front.jpg'])
    expect(ix.images.get(join(root, 'm/C'))?.path).toBe(join(root, 'm/C/Scans/front.jpg'))
  })

  it('runs one disk job at a time while a song plays', async () => {
    file('m/A/01.flac')
    file('m/A/02.flac')
    file('m/A/cover.jpg')
    file('m/B/03.flac')
    file('m/B/b.cue')
    const k = file('m/C/04.flac')
    const ix = emptyIndex()
    ix.files.set(k, known(k, 'Known'))
    let busy = 0
    let most = 0
    const disk =
      <A extends unknown[], T>(f: (...a: A) => Promise<T>) =>
      async (...a: A): Promise<T> => {
        most = Math.max(most, ++busy)
        try {
          await sleep(2)
          return await f(...a)
        } finally {
          busy--
        }
      }
    const turns = new Turns()
    const rest = (): Promise<void> => sleep(1)
    const pace = {
      dir: new Pacer(8, 1, false, rest, undefined, turns),
      stat: new Pacer(16, 2, false, rest, undefined, turns),
      read: new Pacer(4, 1, true, rest, undefined, turns)
    }
    for (const p of Object.values(pace)) p.setSlow(true)
    const walkFs: WalkFs = {
      realpath: (p) => realpath(p),
      readdir: disk((p: string) => readdir(p, { withFileTypes: true })),
      stat: (p) => stat(p)
    }
    const b = setup(ix, [join(root, 'm')])
    const base = b.opts
    const r = setup(ix, [join(root, 'm')], {
      pace,
      walkFs,
      stat: disk((p: string) => stat(p, { bigint: true })),
      readFile: disk(base.readFile),
      readCue: disk(base.readCue),
      readImage: disk(base.readImage)
    })
    await scanFiles(r.opts)
    expect(b.reads).toHaveLength(3)
    expect(b.events).toContain('cue b.cue')
    expect(most).toBe(1)
  })
})
