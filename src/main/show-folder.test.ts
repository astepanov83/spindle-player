import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { folderToOpen } from './show-folder'

describe('folderToOpen', () => {
  const roots = ['/home/me/Music']

  it('joins a music folder and the names below it', () => {
    expect(folderToOpen(['/home/me/Music', 'Rock', 'A'], roots)).toBe(
      join('/home/me/Music', 'Rock', 'A')
    )
    expect(folderToOpen(['/home/me/Music'], roots)).toBe('/home/me/Music')
  })

  it('takes only a saved music folder at the start', () => {
    expect(folderToOpen(['/etc'], roots)).toBeNull()
    expect(folderToOpen(['/home/me', 'Music'], roots)).toBeNull()
  })

  it('refuses names that climb out or hold a separator', () => {
    for (const bad of ['..', '.', '', 'a/b', 'a\\b', 'a\0b'])
      expect(folderToOpen(['/home/me/Music', bad], roots)).toBeNull()
  })

  it('refuses what is not a list of strings', () => {
    expect(folderToOpen('/home/me/Music', roots)).toBeNull()
    expect(folderToOpen([], roots)).toBeNull()
    expect(folderToOpen(['/home/me/Music', 3], roots)).toBeNull()
  })
})
