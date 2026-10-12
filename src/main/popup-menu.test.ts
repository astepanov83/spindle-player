import { describe, expect, it } from 'vitest'
import { parsePopupItems, popupTemplate } from './popup-menu'

describe('parsePopupItems', () => {
  it('keeps rows, lines and ticks', () => {
    expect(
      parsePopupItems(
        [{ id: 'a', label: 'Studio' }, 'line', { id: 'pin', label: 'Keep on top', checked: false }],
        'linux'
      )
    ).toEqual([
      { id: 'a', label: 'Studio' },
      'line',
      { id: 'pin', label: 'Keep on top', checked: false }
    ])
  })

  it('doubles "&" where it marks a shortcut key', () => {
    expect(parsePopupItems([{ id: 'a', label: 'Rock & Roll' }], 'win32')).toEqual([
      { id: 'a', label: 'Rock && Roll' }
    ])
    expect(parsePopupItems([{ id: 'a', label: 'Rock & Roll' }], 'darwin')).toEqual([
      { id: 'a', label: 'Rock & Roll' }
    ])
  })

  it('drops a menu with a bad row', () => {
    for (const raw of [
      undefined,
      [],
      'line',
      [{ id: '', label: 'x' }],
      [{ id: 'a' }],
      [{ id: 'a', label: 'x', checked: 'yes' }],
      [null],
      Array.from({ length: 41 }, (_, i) => ({ id: `${i}`, label: 'x' }))
    ])
      expect(parsePopupItems(raw, 'linux')).toBeNull()
  })
})

describe('popupTemplate', () => {
  it('gives each row its click and a check box when it has a tick', () => {
    const picked: string[] = []
    const t = popupTemplate(
      [{ id: 'a', label: 'A' }, 'line', { id: 'b', label: 'B', checked: true }],
      (id) => picked.push(id)
    )
    expect(t[1]).toEqual({ type: 'separator' })
    expect(t[2]).toMatchObject({ label: 'B', type: 'checkbox', checked: true })
    expect(t[0]).not.toHaveProperty('type')
    ;(t[0].click as () => void)()
    ;(t[2].click as () => void)()
    expect(picked).toEqual(['a', 'b'])
  })
})
