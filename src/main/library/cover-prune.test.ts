import { describe, expect, it } from 'vitest'
import { pruneCoverFiles, removeOldTemp, tmpAgeMs, type PruneFs } from './cover-prune'

const h1 = '1'.repeat(40)
const h2 = '2'.repeat(40)
const h3 = '3'.repeat(40)

// A cache folder in memory. `onReaddir` runs while the listing is on its way,
// like a scan that starts during the wait.
function fakeFs(
  files: Record<string, number>,
  onReaddir: () => void = () => {}
): PruneFs & { left: () => string[] } {
  const f = { ...files }
  return {
    readdir: async () => {
      const names = Object.keys(f)
      await Promise.resolve()
      onReaddir()
      return names
    },
    mtimeMs: async (p) => {
      const t = f[p.slice(p.lastIndexOf('/') + 1)]
      if (t === undefined) throw new Error('ENOENT')
      return t
    },
    rm: async (p) => {
      delete f[p.slice(p.lastIndexOf('/') + 1)]
    },
    left: () => Object.keys(f).sort()
  }
}

const now = 1_000_000

describe('pruneCoverFiles', () => {
  it('deletes covers nothing uses, and keeps used and waiting ones', async () => {
    const fs = fakeFs({
      [`${h1}.jpg`]: 0,
      [`${h1}-large.jpg`]: 0,
      [`${h2}.jpg`]: 0,
      [`${h2}.bad`]: 0,
      [`${h3}.jpg`]: 0,
      'notes.txt': 0
    })
    const forgot: string[] = []
    await pruneCoverFiles({
      dir: '/c',
      used: () => new Set([h1]),
      busy: (h) => h === h3,
      stale: () => false,
      forget: (h) => forgot.push(h),
      now: () => now,
      fs
    })
    expect(fs.left()).toEqual([`${h1}-large.jpg`, `${h1}.jpg`, `${h3}.jpg`, 'notes.txt'])
    expect(forgot).toEqual([h2, h2])
  })

  it('keeps a cover the index started using while the folder was read', async () => {
    const used = new Set<string>()
    const fs = fakeFs({ [`${h1}.jpg`]: 0, [`${h2}.jpg`]: 0 }, () => used.add(h1))
    await pruneCoverFiles({
      dir: '/c',
      used: () => used,
      busy: () => false,
      stale: () => false,
      now: () => now,
      fs
    })
    expect(fs.left()).toEqual([`${h1}.jpg`])
  })

  it('stops once a newer scan is asked for', async () => {
    let stale = false
    const fs = fakeFs({ [`${h1}.jpg`]: 0, [`${h2}.jpg`]: 0 }, () => (stale = true))
    await pruneCoverFiles({
      dir: '/c',
      used: () => new Set(),
      busy: () => false,
      stale: () => stale,
      now: () => now,
      fs
    })
    expect(fs.left()).toEqual([`${h1}.jpg`, `${h2}.jpg`])
  })

  it('does not even list the folder for a scan that is already stale', async () => {
    const fs = fakeFs({ [`${h1}.jpg`]: 0 })
    await pruneCoverFiles({
      dir: '/c',
      used: () => new Set(),
      busy: () => false,
      stale: () => true,
      now: () => now,
      fs
    })
    expect(fs.left()).toEqual([`${h1}.jpg`])
  })

  it('leaves a temp file that may still be written, and deletes an old one', async () => {
    const fresh = `${h1}-large.jpg.123.4.tmp`
    const old = `${h2}.jpg.99.1.tmp`
    const fs = fakeFs({ [fresh]: now - tmpAgeMs + 1000, [old]: now - tmpAgeMs - 1000 })
    await pruneCoverFiles({
      dir: '/c',
      used: () => new Set(),
      busy: () => false,
      stale: () => false,
      now: () => now,
      fs
    })
    expect(fs.left()).toEqual([fresh])
  })

  it('checks again after the wait on a temp file', async () => {
    const tmp = `${h1}.jpg.1.1.tmp`
    const used = new Set<string>()
    const fs = fakeFs({ [tmp]: 0 })
    const mtime = fs.mtimeMs
    fs.mtimeMs = async (p) => {
      const t = await mtime(p)
      used.add(h1)
      return t
    }
    await pruneCoverFiles({
      dir: '/c',
      used: () => used,
      busy: () => false,
      stale: () => false,
      now: () => now,
      fs
    })
    expect(fs.left()).toEqual([tmp])
  })

  it('does nothing when there is no cache folder', async () => {
    const fs = fakeFs({})
    fs.readdir = async () => {
      throw new Error('ENOENT')
    }
    await expect(
      pruneCoverFiles({
        dir: '/c',
        used: () => new Set(),
        busy: () => false,
        stale: () => false,
        fs
      })
    ).resolves.toBeUndefined()
  })
})

describe('removeOldTemp', () => {
  it('removes old temp files and leaves ones main may still be writing', async () => {
    const fs = fakeFs({
      [`${h1}.jpg`]: 0,
      [`${h1}.jpg.9.1.tmp`]: now - tmpAgeMs - 1,
      [`${h2}-large.jpg.9.2.tmp`]: now - 1000,
      'other.tmp': 0
    })
    await removeOldTemp('/c', () => now, fs)
    expect(fs.left()).toEqual([`${h1}.jpg`, `${h2}-large.jpg.9.2.tmp`].sort())
  })

  it('does nothing when there is no folder', async () => {
    const fs: PruneFs = {
      readdir: async () => {
        throw new Error('ENOENT')
      },
      mtimeMs: async () => 0,
      rm: async () => {}
    }
    await expect(removeOldTemp('/c', () => now, fs)).resolves.toBeUndefined()
  })
})
