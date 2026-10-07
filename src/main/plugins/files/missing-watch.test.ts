import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanStatus } from '../../../shared/library'
import { MissingWatch, hasEntries } from './missing-watch'

const status = (missing: string[], phase: ScanStatus['phase'] = 'idle'): ScanStatus => ({
  folders: ['/nas/Music', '/home/m'],
  phase,
  done: 0,
  total: 0,
  tracks: 0,
  albums: 0,
  failed: 0,
  missing
})

// A watch over fake folders: `there` holds the ones that list entries.
function setup(): { w: MissingWatch; there: Set<string>; scans: () => number; on: { v: boolean } } {
  const there = new Set<string>()
  const on = { v: true }
  let n = 0
  const w = new MissingWatch(
    {
      hasEntries: async (d) => there.has(d),
      scan: () => n++,
      canScan: () => on.v
    },
    1000
  )
  return { w, there, scans: () => n, on }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('watching music folders that were not found', () => {
  it('scans once the folder is back, and not before', async () => {
    const { w, there, scans } = setup()
    w.update(status(['/nas/Music']))
    await vi.advanceTimersByTimeAsync(3000)
    expect(scans()).toBe(0)
    there.add('/nas/Music')
    await vi.advanceTimersByTimeAsync(1000)
    expect(scans()).toBe(1)
  })

  it('does nothing while no folder is missing, or while a scan runs', async () => {
    const { w, there, scans } = setup()
    there.add('/nas/Music')
    w.update(status([]))
    await vi.advanceTimersByTimeAsync(5000)
    w.update(status(['/nas/Music'], 'walk'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(scans()).toBe(0)
  })

  it('stops after its scan finds the folder', async () => {
    const { w, there, scans } = setup()
    w.update(status(['/nas/Music']))
    there.add('/nas/Music')
    await vi.advanceTimersByTimeAsync(1000)
    w.update(status([], 'walk'))
    w.update(status([]))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(scans()).toBe(1)
  })

  it('does not scan again for a folder still missing after its scan (no music in it now)', async () => {
    const { w, there, scans } = setup()
    there.add('/nas/Music')
    w.update(status(['/nas/Music']))
    await vi.advanceTimersByTimeAsync(1000)
    w.update(status(['/nas/Music']))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(scans()).toBe(1)
    // gone and back: worth a scan again
    there.delete('/nas/Music')
    await vi.advanceTimersByTimeAsync(1000)
    there.add('/nas/Music')
    await vi.advanceTimersByTimeAsync(1000)
    expect(scans()).toBe(2)
  })

  it('asks for no scan while scans may not run (window closed, plugin off)', async () => {
    const { w, there, scans, on } = setup()
    there.add('/nas/Music')
    on.v = false
    w.update(status(['/nas/Music']))
    await vi.advanceTimersByTimeAsync(5000)
    expect(scans()).toBe(0)
  })

  it('stop() ends the wait', async () => {
    const { w, there, scans } = setup()
    w.update(status(['/nas/Music']))
    there.add('/nas/Music')
    w.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(scans()).toBe(0)
  })
})

describe('hasEntries', () => {
  it('is true for a folder with something in it, false for an empty or missing one', async () => {
    vi.useRealTimers()
    const dir = await mkdtemp(join(tmpdir(), 'spindle-watch-'))
    try {
      await mkdir(join(dir, 'empty'))
      await mkdir(join(dir, 'full'))
      await writeFile(join(dir, 'full', 'a.mp3'), '')
      expect(await hasEntries(join(dir, 'full'))).toBe(true)
      expect(await hasEntries(join(dir, 'empty'))).toBe(false)
      await expect(hasEntries(join(dir, 'gone'))).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})
