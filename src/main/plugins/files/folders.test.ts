import { describe, expect, it } from 'vitest'
import { folderTable } from './folders'

// each folder as its path from the music folder, for easy reading
function paths(t: ReturnType<typeof folderTable>): string[] {
  const out: string[] = []
  t.folders.forEach((f, i) => (out[i] = f.parent < 0 ? f.name : `${out[f.parent]}|${f.name}`))
  return out
}

describe('folderTable', () => {
  it('lists each folder once, parents first, and gives each song its folder', () => {
    const t = folderTable(['/m/A/x', '/m/A/x', '/m/B', '/m/A'], ['/m'])
    expect(paths(t)).toEqual(['/m', '/m|A', '/m|A|x', '/m|B'])
    expect(t.index).toEqual([2, 2, 3, 1])
  })

  it('adds the folders between a music folder and a song, which hold no songs', () => {
    const t = folderTable(['/m/a/b/c'], ['/m'])
    expect(paths(t)).toEqual(['/m', '/m|a', '/m|a|b', '/m|a|b|c'])
    expect(t.index).toEqual([3])
  })

  it('keeps music folders in settings order and sorts subfolders by name, numbers as numbers', () => {
    const t = folderTable(['/z/b', '/a/x10', '/a/x9', '/a/X1', '/z/a'], ['/z', '/a'])
    expect(paths(t)).toEqual(['/z', '/z|a', '/z|b', '/a', '/a|X1', '/a|x9', '/a|x10'])
  })

  it('leaves out music folders with no songs', () => {
    const t = folderTable(['/b/1'], ['/a', '/b'])
    expect(paths(t)).toEqual(['/b', '/b|1'])
  })

  it('puts songs right in a music folder in it', () => {
    const t = folderTable(['/m'], ['/m'])
    expect(paths(t)).toEqual(['/m'])
    expect(t.index).toEqual([0])
  })

  it('puts a song under the deepest music folder it is in', () => {
    const t = folderTable(['/m/rock/a', '/m/jazz'], ['/m', '/m/rock'])
    expect(paths(t)).toEqual(['/m', '/m|jazz', '/m/rock', '/m/rock|a'])
  })

  it('lists a folder outside every music folder as its own', () => {
    const t = folderTable(['/old/x'], ['/m'])
    expect(paths(t)).toEqual(['/old/x'])
  })

  it('does not take /m2 for a folder under /m', () => {
    const t = folderTable(['/m2/a'], ['/m', '/m2'])
    expect(paths(t)).toEqual(['/m2', '/m2|a'])
  })
})
